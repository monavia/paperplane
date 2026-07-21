import express from "express";
import Config from "../config/bot";
import Logger from "../core/utils/Logger";
import * as PlayerService from "../music/services/PlayerService";
import { getQueue } from "../music/services/QueueService";
import { getClient, get as getLavalink } from "../music/engine/lavalink";
import { getVoiceJoinDuration } from "../music/engine/PlayerManager";
import state from "../core/state/StateManager";
import {
  getLastEqualizer, setLastEqualizer, getLastFilter, setLastFilter,
  getPrefix, setPrefix, updateVolume,
  getAutoplay, setAutoplay, getLoop, setLoop, getShuffle, setShuffle, get247, set247,
} from "../database/repositories/GuildRepository";
import { getHistory } from "../music/services/HistoryService";
import { fetchLyrics } from "../music/services/LyricsService";
import { removeFromQueue, swapTracks, moveTrack, clearQueue } from "../music/services/QueueService";
import mongoose from "mongoose";
import { getMetrics } from "../telemetry/MetricsCollector";
import * as Sentry from "@sentry/node";
import { createApiHandler, jsonResponse, ApiError, withAuth, getUserId, requireApiSameVoice, guildRateLimit } from "../../lib/api-base";

const SNOWFLAKE_RE = /^\d{17,20}$/;
function validateGuildId(req: any, res: any, next: any) {
  const guildId = req.params.guildId;
  if (guildId && !SNOWFLAKE_RE.test(guildId)) {
    return res.status(400).json({ success: false, error: "Invalid guildId" });
  }
  next();
}

function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

function getRequesterId(track: any): string | null {
  if (!track) return null;
  const req = track.info?.requester || track.requester || track.info?.user || null;
  return typeof req === "object" && req !== null ? (req.id || req.userId) : req;
}

function formatTrack(track: any) {
  if (!track) return null;
  const info = track.info || {};
  const thumb = info.artworkUrl || (info.identifier?.length === 11 ? `https://img.youtube.com/vi/${info.identifier}/maxresdefault.jpg` : null);
  return {
    title: info.title,
    artist: info.artist,
    duration: info.duration || 0,
    uri: info.uri,
    thumbnail: thumb,
    requester: getRequesterId(track),
  };
}

export async function startApiServer(_status?: any): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(withAuth());
  app.use("/api/guild/:guildId", validateGuildId);
  app.use("/api/activities/:guildId", validateGuildId);

  // Per-guild rate limiting
  app.use("/api/guild/:guildId/player", guildRateLimit(30, 60000));
  app.use("/api/guild/:guildId/queue", guildRateLimit(20, 60000));
  app.use("/api/guild/:guildId/filter", guildRateLimit(20, 60000));
  app.use("/api/guild/:guildId/equalizer", guildRateLimit(20, 60000));
  app.use("/api/guild/:guildId/search", guildRateLimit(15, 60000));
  app.use("/api/guild/:guildId/settings", guildRateLimit(20, 60000));
  app.use("/api/guild/:guildId", guildRateLimit(60, 60000)); // catch-all GET

  // Swagger UI — API Docs (exempt from auth)
  const swaggerUi = await import("swagger-ui-express").then(m => m.default || m).catch(() => null);
  if (swaggerUi) {
    const spec = await import("./openapi.json", { with: { type: "json" } }).then(m => m.default || m).catch(() => null);
    if (spec) app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec));
  }

  app.get("/api/metrics", (_req, res) => {
    const m = getMetrics();
    const lines: string[] = [
      '# HELP paperplane_tracks_played Total tracks played',
      '# TYPE paperplane_tracks_played counter',
      `paperplane_tracks_played ${m.tracksPlayed}`,
      '# HELP paperplane_tracks_failed Total tracks failed',
      '# TYPE paperplane_tracks_failed counter',
      `paperplane_tracks_failed ${m.tracksFailed}`,
      '# HELP paperplane_commands_executed Total commands executed',
      '# TYPE paperplane_commands_executed counter',
      `paperplane_commands_executed ${m.commandsExecuted}`,
      '# HELP paperplane_guild_count Guild count',
      '# TYPE paperplane_guild_count gauge',
      `paperplane_guild_count ${m.guildCount}`,
      '# HELP paperplane_voice_connections Active voice connections',
      '# TYPE paperplane_voice_connections gauge',
      `paperplane_voice_connections ${m.voiceConnections}`,
      '# HELP paperplane_active_players Active players',
      '# TYPE paperplane_active_players gauge',
      `paperplane_active_players ${m.activePlayers}`,
      '# HELP paperplane_active_guilds Active guilds',
      '# TYPE paperplane_active_guilds gauge',
      `paperplane_active_guilds ${m.activeGuilds}`,
      '# HELP paperplane_lavalink_nodes_online Lavalink nodes online',
      '# TYPE paperplane_lavalink_nodes_online gauge',
      `paperplane_lavalink_nodes_online ${m.lavalinkNodesOnline}`,
      '# HELP paperplane_rate_limit_blocked Rate limited requests',
      '# TYPE paperplane_rate_limit_blocked counter',
      `paperplane_rate_limit_blocked ${m.rateLimitBlocked}`,
    ];
    for (const [key, val] of Object.entries(m.lavalinkNodePlayers || {})) {
      lines.push(`paperplane_lavalink_node_players{node="${key}"} ${val}`);
    }
    for (const [key, val] of Object.entries(m.lavalinkNodePenalty || {})) {
      lines.push(`paperplane_lavalink_node_penalty{node="${key}"} ${val}`);
    }
    for (const [key, val] of Object.entries(m.tracksFailedByLabel || {})) {
      lines.push(`paperplane_tracks_failed_total{error="${key}"} ${val}`);
    }
    for (const [key, val] of Object.entries(m.commandsExecutedByLabel || {})) {
      lines.push(`paperplane_commands_executed_total{command="${key}"} ${val}`);
    }
    for (const [key, val] of Object.entries(m.commandLatency || {})) {
      lines.push(`paperplane_command_latency_ms{command="${key}"} ${val}`);
    }
    res.type("text/plain").send(lines.join("\n") + "\n");
  });

app.get("/api/health", createApiHandler(async (_req, res) => {
    const client = getClient();
    jsonResponse(res, {
      status: "ok",
      uptime: process.uptime(),
      guilds: client?.guilds?.cache?.size || 0,
    });
  }));

  app.get("/api/guilds", createApiHandler(async (_req, res) => {
    const client = getClient();
    if (!client?.guilds?.cache) {
      Logger.warn("[API] getClient() returned null or no guilds cache");
      jsonResponse(res, []);
      return;
    }
    Logger.info(`[API] Guilds cache size: ${client.guilds.cache.size}, client user: ${client.user?.tag}`);
    const guilds = client.guilds.cache.values().map((g: any) => ({
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      banner: g.banner || null,
    }));
    jsonResponse(res, Array.from(guilds));
  }));

  app.get("/api/guild/:guildId/equalizer", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const current = await getLastEqualizer(guildId);
    jsonResponse(res, {
      current: typeof current === 'string' ? current : "flat",
      presets: ["flat", "bass", "treble", "rock", "jazz", "pop", "edm", "classical"],
    });
  }));

  app.post("/api/guild/:guildId/equalizer", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const { preset } = req.body;
    const EQ_PRESETS: Record<string, { band: number; gain: number }[]> = {
      flat: Array.from({ length: 15 }, (_, i) => ({ band: i, gain: 0.0 })),
      bass: Array.from({ length: 15 }, (_, i) => ({ band: i, gain: i < 5 ? 0.4 - i * 0.1 : -0.05 - (i - 5) * 0.02 })),
      treble: Array.from({ length: 15 }, (_, i) => ({ band: i, gain: i < 5 ? -0.2 + i * 0.05 : -0.1 + (i - 5) * 0.05 })),
      rock: [
        { band: 0, gain: 0.2 }, { band: 1, gain: 0.1 }, { band: 2, gain: 0.0 },
        { band: 3, gain: -0.1 }, { band: 4, gain: -0.1 }, { band: 5, gain: 0.0 },
        { band: 6, gain: 0.1 }, { band: 7, gain: 0.2 }, { band: 8, gain: 0.3 },
        { band: 9, gain: 0.3 }, { band: 10, gain: 0.3 }, { band: 11, gain: 0.2 },
        { band: 12, gain: 0.1 }, { band: 13, gain: 0.0 }, { band: 14, gain: -0.1 },
      ],
      jazz: [
        { band: 0, gain: 0.2 }, { band: 1, gain: 0.15 }, { band: 2, gain: 0.1 },
        { band: 3, gain: 0.05 }, { band: 4, gain: 0.0 }, { band: 5, gain: -0.05 },
        { band: 6, gain: -0.1 }, { band: 7, gain: -0.05 }, { band: 8, gain: 0.0 },
        { band: 9, gain: 0.05 }, { band: 10, gain: 0.1 }, { band: 11, gain: 0.15 },
        { band: 12, gain: 0.2 }, { band: 13, gain: 0.25 }, { band: 14, gain: 0.3 },
      ],
      pop: [
        { band: 0, gain: -0.05 }, { band: 1, gain: 0.0 }, { band: 2, gain: 0.05 },
        { band: 3, gain: 0.1 }, { band: 4, gain: 0.15 }, { band: 5, gain: 0.2 },
        { band: 6, gain: 0.2 }, { band: 7, gain: 0.15 }, { band: 8, gain: 0.1 },
        { band: 9, gain: 0.05 }, { band: 10, gain: 0.0 }, { band: 11, gain: -0.05 },
        { band: 12, gain: -0.1 }, { band: 13, gain: -0.1 }, { band: 14, gain: -0.05 },
      ],
      edm: [
        { band: 0, gain: 0.3 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.15 },
        { band: 3, gain: 0.0 }, { band: 4, gain: -0.05 }, { band: 5, gain: 0.0 },
        { band: 6, gain: 0.1 }, { band: 7, gain: 0.2 }, { band: 8, gain: 0.25 },
        { band: 9, gain: 0.3 }, { band: 10, gain: 0.35 }, { band: 11, gain: 0.3 },
        { band: 12, gain: 0.2 }, { band: 13, gain: 0.1 }, { band: 14, gain: 0.0 },
      ],
      classical: [
        { band: 0, gain: 0.1 }, { band: 1, gain: 0.05 }, { band: 2, gain: 0.0 },
        { band: 3, gain: -0.05 }, { band: 4, gain: -0.1 }, { band: 5, gain: -0.05 },
        { band: 6, gain: 0.0 }, { band: 7, gain: 0.05 }, { band: 8, gain: 0.1 },
        { band: 9, gain: 0.15 }, { band: 10, gain: 0.2 }, { band: 11, gain: 0.25 },
        { band: 12, gain: 0.3 }, { band: 13, gain: 0.25 }, { band: 14, gain: 0.2 },
      ],
    };

    const bands = EQ_PRESETS[preset] || EQ_PRESETS.flat;
    const ok = await PlayerService.setEqualizer(guildId, bands, "dashboard", "Dashboard");
    if (ok) await setLastEqualizer(guildId, preset);
    jsonResponse(res, { success: ok });
  }));

  app.get("/api/guild/:guildId/insights", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const days = parseInt(req.query.days as string) || 7;
    const history = await getHistory(guildId, 500);
    const cutoff = new Date(Date.now() - days * 86400000);
    const filtered = history.filter((h: any) => new Date(h.playedAt || h.timestamp) >= cutoff);

    const totalPlays = filtered.length;
    const uniqueUsers = new Set(filtered.map((h: any) => h.userId)).size;

    const dailyMap: Record<string, number> = {};
    filtered.forEach((h: any) => {
      const d = new Date(h.playedAt || h.timestamp).toISOString().split('T')[0];
      dailyMap[d] = (dailyMap[d] || 0) + 1;
    });
    const dailyPlays = Object.entries(dailyMap).map(([date, plays]) => ({ date, plays })).sort((a, b) => a.date.localeCompare(b.date));

    const trackMap: Record<string, { title: string; author: string; plays: number; thumbnail: string | null }> = {};
    filtered.forEach((h: any) => {
      const title = h.songTitle || h.track?.info?.title || "Unknown";
      const author = h.artist || h.track?.info?.author || "";
      const identifier = h.identifier || h.track?.info?.identifier || "";
      const artworkUrl = h.artworkUrl || h.track?.info?.artworkUrl || null;
      const thumbnail = artworkUrl || (identifier && identifier.length === 11 ? `https://img.youtube.com/vi/${identifier}/mqdefault.jpg` : null);
      if (!trackMap[title]) trackMap[title] = { title, author, plays: 0, thumbnail };
      trackMap[title].plays++;
    });
    const topTracks = Object.values(trackMap).sort((a, b) => b.plays - a.plays).slice(0, 10);

    const hourlyMap: Record<number, number> = {};
    for (let i = 0; i < 24; i++) hourlyMap[i] = 0;
    filtered.forEach((h: any) => {
      const hour = new Date(h.playedAt || h.timestamp).getHours();
      hourlyMap[hour]++;
    });
    const hourlyActivity = Object.entries(hourlyMap).map(([hour, plays]) => ({ hour: parseInt(hour), plays }));

    const totalPlayTime = totalPlays * 210000;
    const avgSession = uniqueUsers > 0 ? Math.round(totalPlays / uniqueUsers) : 0;

    jsonResponse(res, { totalPlays, uniqueUsers, totalPlayTime, avgSession, dailyPlays, topTracks, hourlyActivity });
  }));

  app.get("/api/guild/:guildId/filter", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const current = await getLastFilter(guildId);
    jsonResponse(res, {
      current,
      filters: ["none", "nightcore", "vaporwave", "slowmo", "soft", "treble", "bassboost", "8d"],
    });
  }));

  app.post("/api/guild/:guildId/filter", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const { filter } = req.body;
    let ok;
    if (!filter || filter === "none") {
      ok = await PlayerService.resetFilters(guildId, "dashboard", "Dashboard");
    } else {
      ok = await PlayerService.setFilter(guildId, filter, "dashboard", "Dashboard");
    }
    if (ok) await setLastFilter(guildId, filter || "none");
    jsonResponse(res, { success: ok });
  }));

  app.get("/api/guild/:guildId/health", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const engine = PlayerService.getEngine(guildId);
    const player = engine?.player;
    const client = getClient();

    let channel = "None";
    let channelName = "None";
    let latency = 0;
    let region = "unknown";

    if (player?.voiceChannelId) {
      channel = player.voiceChannelId;
      region = (player.node as any)?.options?.region || player.node?.options?.regions?.[0] || "unknown";
      if (client?.guilds) {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (guild?.channels) {
          const vc = guild.channels.cache.get(player.voiceChannelId) || await guild.channels.fetch(player.voiceChannelId).catch(() => null);
          if (vc) channelName = vc.name;
        }
      }
      if (player.state?.ping !== undefined && player.state.ping >= 0) latency = player.state.ping;
    }

    jsonResponse(res, {
      latency,
      channel: channelName,
      channelId: channel,
      status: player?.paused ? "Paused" : player?.playing ? "Playing" : channel !== "None" ? "Connected" : "Idle",
      playing: player?.playing || false,
      paused: player?.paused || false,
      lavalinkNode: player?.node?.name || "None",
      lavalinkRegion: region,
    });
  }));

  app.get("/api/guild/:guildId/nowplaying", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const engine = PlayerService.getEngine(guildId);
    const player = engine?.player;

    if (!player || (!player.playing && !player.paused)) {
      jsonResponse(res, null);
      return;
    }

    const track = state.nowPlaying.get(guildId);
    if (!track) {
      jsonResponse(res, null);
      return;
    }

    const thumb = track.info.artworkUrl || (track.info.identifier?.length === 11 ? `https://img.youtube.com/vi/${track.info.identifier}/maxresdefault.jpg` : null);

    jsonResponse(res, {
      title: track.info.title,
      artist: track.info.artist,
      album: track.info.album || null,
      thumbnail: thumb,
      progress: ((player.position || 0) / (track.info.duration || 1)) * 100,
      duration: track.info.duration,
      current: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      requester: getRequesterId(track),
    });
  }));

  app.get("/api/guild/:guildId/queue", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const tracks = getQueue(guildId);
    const current = state.nowPlaying.get(guildId);
    const hasCurrent = !!current;

    jsonResponse(res, {
      current: current ? formatTrack(current) : null,
      upcoming: (hasCurrent ? tracks.slice(1) : tracks).map(formatTrack),
      total: tracks.length,
    });
  }));

  app.get("/api/guild/:guildId/stats", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const engine = PlayerService.getEngine(guildId);
    const player = engine?.player;
    const queueLength = engine?.queue?.getAll()?.length || 0;
    const voiceMs = getVoiceJoinDuration(guildId);
    const uptime = voiceMs > 0 ? formatUptime(voiceMs) : "0h 0m";

    let activeUsers = 0;
    const voiceChannelId = player?.voiceChannelId;
    if (voiceChannelId) {
      try {
        const client = getClient();
        if (client?.guilds) {
          const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
          if (guild?.channels) {
            const vc = guild.channels.cache.get(voiceChannelId) || (await guild.channels.fetch(voiceChannelId).catch(() => null));
            if (vc?.members) {
              activeUsers = vc.members.filter((m: any) => !m?.user?.bot).size;
            }
          }
        }
      } catch (e) {
        Logger.error("[Stats] Voice channel members error:", e);
      }
    }

    jsonResponse(res, {
      activeUsers,
      queueLength,
      uptime,
      playing: player?.playing || false,
      paused: player?.paused || false,
      status: player?.paused ? "Paused" : player?.playing ? "Playing" : "Idle",
    });
  }));

  app.post("/api/guild/:guildId/player", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const { action, value } = req.body;
    const userId = getUserId(req);
    const engine = PlayerService.getEngine(guildId);
    requireApiSameVoice(getClient(), engine, guildId, userId);

    switch (action) {
      case "pause":
        await PlayerService.pause(guildId, "dashboard", "Dashboard");
        jsonResponse(res, { success: true });
        break;
      case "resume":
        await PlayerService.resume(guildId, "dashboard", "Dashboard");
        jsonResponse(res, { success: true });
        break;
      case "stop":
        await PlayerService.stop(guildId, "dashboard", "Dashboard");
        jsonResponse(res, { success: true });
        break;
      case "skip":
        await PlayerService.skip(guildId, "dashboard", "Dashboard");
        jsonResponse(res, { success: true });
        break;
      case "volume":
        PlayerService.setVolume(guildId, value ?? 100, "dashboard", "Dashboard");
        jsonResponse(res, { success: true });
        break;
      case "seek":
        PlayerService.seek(guildId, value ?? 0, "dashboard", "Dashboard");
        jsonResponse(res, { success: true });
        break;
      default:
        throw new ApiError(400, `Unknown action: ${action}`);
    }
  }));

  app.get("/api/guild/:guildId/lyrics", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const engine = PlayerService.getEngine(guildId);
    const player = engine?.player;

    if (!player || (!player.playing && !player.paused)) {
      jsonResponse(res, null);
      return;
    }

    const track = state.nowPlaying.get(guildId);
    if (!track) {
      jsonResponse(res, null);
      return;
    }

    const lyrics = await fetchLyrics(track);
    if (!lyrics) {
      jsonResponse(res, null);
      return;
    }

    jsonResponse(res, {
      track: {
        title: track.info.title,
        artist: track.info.author || track.info.artist || "",
        album: track.info.album || null,
        thumbnail: track.info.artworkUrl || (track.info.identifier?.length === 11 ? `https://img.youtube.com/vi/${track.info.identifier}/maxresdefault.jpg` : null),
      },
      text: lyrics.text,
      source: lyrics.source,
      synced: lyrics.synced || null,
    });
  }));

  app.get("/api/activities/:guildId", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const history = await getHistory(guildId, limit);
    const client = getClient();

    const data = await Promise.all(history.map(async (h: any) => {
      let userName = null;
      if (client?.users?.cache) {
        const guild = client.guilds?.cache?.get(guildId);
        const member = guild?.members?.cache?.get(h.userId) || await guild?.members?.fetch(h.userId).catch(() => null);
        if (member?.displayName) {
          userName = member.displayName;
        } else {
          const user = client.users.cache.get(h.userId) || await client.users.fetch(h.userId).catch(() => null);
          userName = user?.globalName || user?.username || null;
        }
      }
      return {
        userId: h.userId,
        userName,
        action: "played",
        songTitle: h.track?.info?.title || h.songTitle || "Unknown",
        artist: h.track?.info?.artist || h.artist || "",
        timestamp: h.playedAt || h.timestamp || new Date(),
      };
    }));
    jsonResponse(res, data);
  }));

  app.get("/api/guild/:guildId/dj-check/:userId", createApiHandler(async (req, res) => {
    const { guildId, userId } = req.params;
    const client = getClient();
    let isDj = false;

    if (client?.guilds) {
      const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
      if (guild) {
        const member = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
        if (member) {
          isDj = member.permissions.has("0x00000020") || member.roles.cache.some((r: any) => r.name.toLowerCase().includes("dj"));
        }
      }
    }

    jsonResponse(res, { isDj });
  }));

  app.get("/api/status", createApiHandler(async (_req, res) => {
    const client = getClient();
    const lavalink = getLavalink();
    const connectedNodes = lavalink?.nodeManager
      ? Array.from(lavalink.nodeManager.nodes.values()).filter((n: any) => n.connected).length
      : 0;

    const dbReady = mongoose.connection?.readyState === 1;

    jsonResponse(res, {
      api: { status: "ok", label: "Online", ok: true },
      websocket: { status: "ok", label: "Connected", ok: true },
      database: { status: dbReady ? "ok" : "error", label: dbReady ? "Connected" : "Disconnected", ok: dbReady },
      lavalink: {
        status: connectedNodes > 0 ? "ok" : "error",
        label: connectedNodes > 0 ? `${connectedNodes} node(s)` : "Disconnected",
        ok: connectedNodes > 0,
      },
      guilds: client?.guilds?.cache?.size || 0,
      uptime: process.uptime(),
    });
  }));

  app.get("/api/metrics/json", createApiHandler(async (_req, res) => {
    jsonResponse(res, getMetrics());
  }));

  // ── 1.2 Dashboard API CRUD ─────────────────────────────────────

  app.delete("/api/guild/:guildId/queue", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const { index } = req.body;
    const userId = getUserId(req);
    const engine = PlayerService.getEngine(guildId);
    requireApiSameVoice(getClient(), engine, guildId, userId);
    if (typeof index !== "number" || index < 0) throw new ApiError(400, "Invalid index");
    const ok = await removeFromQueue(guildId, index);
    if (!ok) throw new ApiError(400, "Cannot remove track at this index");
    jsonResponse(res, { success: true });
  }));

  app.put("/api/guild/:guildId/queue", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const { action, fromIndex, toIndex } = req.body;
    const userId = getUserId(req);
    const engine = PlayerService.getEngine(guildId);
    requireApiSameVoice(getClient(), engine, guildId, userId);
    if (action === "move") {
      if (typeof fromIndex !== "number" || typeof toIndex !== "number") throw new ApiError(400, "fromIndex and toIndex required");
      const ok = await moveTrack(guildId, fromIndex, toIndex);
      if (!ok) throw new ApiError(400, "Cannot move track");
      jsonResponse(res, { success: true });
    } else if (action === "swap") {
      if (typeof fromIndex !== "number" || typeof toIndex !== "number") throw new ApiError(400, "fromIndex and toIndex required");
      const ok = await swapTracks(guildId, fromIndex, toIndex);
      if (!ok) throw new ApiError(400, "Cannot swap tracks");
      jsonResponse(res, { success: true });
    } else if (action === "clear") {
      await clearQueue(guildId);
      jsonResponse(res, { success: true });
    } else {
      throw new ApiError(400, `Unknown action: ${action}. Use move, swap, or clear`);
    }
  }));

  app.get("/api/guild/:guildId/settings", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const [prefix, volume, autoplay, loop, shuffle, is247] = await Promise.all([
      getPrefix(guildId),
      PlayerService.getEngine(guildId)?.player?.volume ?? 100,
      getAutoplay(guildId),
      getLoop(guildId),
      getShuffle(guildId),
      get247(guildId),
    ]);
    jsonResponse(res, { prefix, volume, autoplay, loop, shuffle, "247": is247 });
  }));

  app.put("/api/guild/:guildId/settings", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const body = req.body;
    const userId = getUserId(req);
    const engine = PlayerService.getEngine(guildId);
    if (engine?.player) requireApiSameVoice(getClient(), engine, guildId, userId);
    const ops: Promise<any>[] = [];
    if (body.prefix !== undefined) ops.push(setPrefix(guildId, String(body.prefix)));
    if (body.volume !== undefined) {
      const v = Math.max(0, Math.min(200, Number(body.volume)));
      ops.push(updateVolume(guildId, v));
      ops.push(Promise.resolve(PlayerService.setVolume(guildId, v, "dashboard", "Dashboard")));
    }
    if (body.autoplay !== undefined) ops.push(setAutoplay(guildId, Boolean(body.autoplay)));
    if (body.loop !== undefined) ops.push(setLoop(guildId, String(body.loop)));
    if (body.shuffle !== undefined) ops.push(setShuffle(guildId, Boolean(body.shuffle)));
    if (body["247"] !== undefined) ops.push(set247(guildId, Boolean(body["247"])));
    await Promise.all(ops);
    jsonResponse(res, { success: true });
  }));

  app.post("/api/guild/:guildId/search", createApiHandler(async (req, res) => {
    const { guildId } = req.params;
    const { query } = req.body;
    if (!query || typeof query !== "string") throw new ApiError(400, "query required");
    const results = await PlayerService.search(guildId, query, { id: "system" });
    jsonResponse(res, {
      tracks: (results.tracks || []).slice(0, 10).map((t: any) => ({
        title: t.info?.title,
        artist: t.info?.author,
        duration: t.info?.duration || 0,
        uri: t.info?.uri,
        thumbnail: t.info?.artworkUrl || (t.info?.identifier?.length === 11 ? `https://img.youtube.com/vi/${t.info.identifier}/maxresdefault.jpg` : null),
        source: t.info?.sourceName || "unknown",
      })),
    });
  }));

  Sentry.setupExpressErrorHandler(app);

  const port = Config.apiPort;
  app.listen(port, Config.apiHost, () => {
    Logger.ready(`API server on ${Config.apiHost}:${port}`);
  });
}
