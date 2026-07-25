import Redis from "ioredis";
import Config from "../config/bot.js";
import Logger from "../core/utils/Logger.js";

let cache: Redis | null = null;
let bus: Redis | null = null;
let _available = false;

const RETRY = {
  retryStrategy(times: number) {
    if (times > 10) return null;
    return Math.min(times * 200, 5000);
  },
  maxRetriesPerRequest: 3,
};

function createCacheRedis(): Redis {
  const r = new Redis(Config.redisUrl, {
    ...RETRY,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  r.on("ready", () => { _available = true; });
  r.on("close", () => { _available = false; });
  r.on("error", (err: Error) => {
    Logger.error(`[Redis:CACHE] ${err.message}`);
  });
  return r;
}

function createBusRedis(): Redis {
  const r = new Redis(Config.redisUrl);
  r.on("error", (err: Error) => {
    Logger.error(`[Redis:BUS] ${err.message}`);
  });
  return r;
}

export function getCache(): Redis | null {
  return cache;
}

export function getBus(): Redis | null {
  return bus;
}

export function isAvailable(): boolean {
  return _available && cache !== null;
}

export async function init(): Promise<void> {
  if (!Config.redisEnabled) {
    Logger.info("[Redis] Disabled via REDIS_ENABLED=false");
    return;
  }
  try {
    cache = createCacheRedis();
    await cache.ping();
    _available = true;
    Logger.ready(`[Redis:CACHE] Connected`);

    bus = createBusRedis();
    Logger.ready(`[Redis:BUS] Connected`);
  } catch (err: any) {
    Logger.warn(`[Redis] Connection failed: ${err.message}. Running without Redis.`);
    cache = null;
    bus = null;
    _available = false;
  }
}

export async function shutdown(): Promise<void> {
  if (bus) { await bus.quit(); bus = null; }
  if (cache) { await cache.quit(); cache = null; }
  _available = false;
}
