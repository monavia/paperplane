import Logger from "../bot/core/utils/Logger.js";
import { incRateLimitBlocked, incRateLimitAllowed } from "../bot/telemetry/MetricsCollector.js";
import { isAvailable, getCache } from "../bot/cache/redis.js";
import Config from "../bot/config/bot.js";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createApiHandler(
  handler: (req: any, res: any, next: any) => Promise<void>,
) {
  return async (req: any, res: any, next: any) => {
    try {
      await handler(req, res, next);
    } catch (err: any) {
      if (err instanceof ApiError) {
        return res.status(err.statusCode).json({ success: false, error: err.message });
      }
      Logger.error(`API Error: ${err.message}`);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  };
}

export function jsonResponse(res: any, data: any, status = 200) {
  return res.status(status).json({ success: true, data });
}

const LOCAL_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function clientIp(req: any): string {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || req.connection?.remoteAddress || "0.0.0.0";
}

function isTrusted(req: any): boolean {
  const TRUSTED_IPS = (process.env.TRUSTED_IPS || "").split(",").map(s => s.trim()).filter(Boolean);
  const API_TOKEN = process.env.BOT_API_TOKEN || "";
  const ip = clientIp(req);
  if (LOCAL_IPS.has(ip)) return true;
  if (TRUSTED_IPS.includes(ip)) return true;
  if (API_TOKEN) {
    const header = req.headers.authorization || "";
    return header === `Bearer ${API_TOKEN}`;
  }
  return false;
}

/** Per-guild sliding window rate limiter (key = guildId:clientIp, prevents spoofing) */
export function guildRateLimit(maxRequests: number, windowMs: number) {
  const windows = new Map<string, number[]>();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of windows) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length) windows.set(key, valid);
      else windows.delete(key);
    }
  }, 15000);
  if (cleanup.unref) cleanup.unref();

  return async (req: any, res: any, next: any) => {
    const guildId = req.params?.guildId;
    if (!guildId) return next();

    const ip = clientIp(req);
    const key = `${guildId}:${ip}`;

    // Redis-backed rate limit
    if (isAvailable()) {
      try {
        const redis = getCache()!;
        const rkey = `${Config.redisPrefix}ratelimit:${key}`;
        const count = await redis.incr(rkey);
        if (count === 1) await redis.pexpire(rkey, windowMs);
        if (count > maxRequests) {
          try { incRateLimitBlocked(); } catch {}
          return res.status(429).json({ success: false, error: "Too many requests. Slow down." });
        }
        try { incRateLimitAllowed(); } catch {}
        return next();
      } catch (err) {
        Logger.warn(`[RateLimit] Redis error, fallback to memory: ${err}`);
      }
    }

    // In-memory fallback
    const now = Date.now();
    let timestamps = windows.get(key) || [];
    timestamps = timestamps.filter(t => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
      try { incRateLimitBlocked(); } catch {}
      return res.status(429).json({ success: false, error: "Too many requests. Slow down." });
    }
    timestamps.push(now);
    windows.set(key, timestamps);
    try { incRateLimitAllowed(); } catch {}
    next();
  };
}

/** Per-IP global rate limit — applies to all routes */
export function globalRateLimit(maxRequests = 1000, windowMs = 60000) {
  const windows = new Map<string, number[]>();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of windows) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length) windows.set(key, valid);
      else windows.delete(key);
    }
  }, 15000);
  if (cleanup.unref) cleanup.unref();

  return (req: any, res: any, next: any) => {
    if (isTrusted(req)) return next();
    const ip = clientIp(req);
    const now = Date.now();
    let timestamps = windows.get(ip) || [];
    timestamps = timestamps.filter(t => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
      return res.status(429).json({ success: false, error: "Global rate limit exceeded." });
    }
    timestamps.push(now);
    windows.set(ip, timestamps);
    next();
  };
}



export function withAuth(exemptPaths: string[] = ["/api/health"]) {
  const exempt = new Set(exemptPaths);
  return (req: any, res: any, next: any) => {
    if (exempt.has(req.path)) return next();
    if (isTrusted(req)) return next();
    res.status(401).json({ success: false, error: "Unauthorized" });
  };
}

/** Extract Discord user ID from request header (set by Dashboard proxy) */
export function getUserId(req: any): string | null {
  return req.headers["x-discord-user-id"] || null;
}

/**
 * Require the requesting user to be in the same voice channel as the bot.
 * Throws ApiError if not.  Silently passes when userId is absent
 * (trusted-ip / system requests skip voice check).
 */
export function requireApiSameVoice(
  client: any,
  engine: any,
  guildId: string,
  userId: string | null,
): void {
  if (!userId) return; // system / trusted-ip — skip
  const guild = client?.guilds?.cache?.get(guildId);
  if (!guild) throw new ApiError(404, "Guild not found");
  const member = guild.members.cache.get(userId);
  if (!member) throw new ApiError(403, "You are not a member of this guild");
  const botVcId = engine?.player?.voiceChannelId;
  if (!botVcId) throw new ApiError(400, "Bot is not in a voice channel");
  if (member.voice?.channelId !== botVcId) {
    throw new ApiError(403, "You must be in the same voice channel as the bot");
  }
}
