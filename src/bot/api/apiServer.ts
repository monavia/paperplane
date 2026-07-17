import express from "express";
import Config from "../config/bot";
import Logger from "../core/utils/Logger";
import { getEngine } from "../music/services/PlayerService";
import { getQueue } from "../music/services/QueueService";
import { getClient, get as getLavalink } from "../music/engine/lavalink";
import { getVoiceJoinDuration } from "../music/engine/PlayerManager";
import state from "../core/state/StateManager";

const TRUSTED_IPS = (process.env.TRUSTED_IPS || "").split(",").map((s) => s.trim()).filter(Boolean);
const API_TOKEN = process.env.BOT_API_TOKEN || "";
const LOCAL_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function isTrusted(req: any): boolean {
  const ip = req.ip || req.connection?.remoteAddress;
  if (LOCAL_IPS.has(ip)) return true;
  if (TRUSTED_IPS.includes(ip)) return true;
  if (API_TOKEN) {
    const header = req.headers.authorization || "";
    return header === `Bearer ${API_TOKEN}`;
  }
  return false;
}

function requireApiAuth(req: any, res: any, next: any) {
  if (req.path === "/api/health") return next();
  if (isTrusted(req)) return next();
  res.status(401).json({ success: false, error: "Unauthorized" });
}

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
  app.use(requireApiAuth);
  app.use("/api/guild/:guildId", validateGuildId);
  app.use("/api/activities/:guildId", validateGuildId);

  app.get("/api/health", (_req, res) => {
    const client = getClient();
    res.json({
      status: "ok",
      uptime: process.uptime(),
      guilds: client?.guilds?.cache?.size || 0,
    });
  });

  app.get("/api/guilds", (_req, res) => {
    try {
      const client = getClient();
      if (!client?.guilds?.cache) {
        Logger.warn("[API] getClient() returned null or no guilds cache");
        return res.json([]);
      }
      const cacheSize = client.guilds.cache.size;
      Logger.info(`[API] Guilds cache size: ${cacheSize}, client user: ${client.user?.tag}`);
      const guilds = client.guilds.cache.values().map((g: any) => ({
        id: g.id,
        name: g.name,
        memberCount: g.memberCount,
        banner: g.banner || null,
      }));
      res.json(Array.from(guilds));
    } catch (error) {
      Logger.error("Error fetching guilds:", error);
      res.json([]);
    }
  });

  // GET /api/guild/:guildId/equalizer — get current EQ state
  app.get("/api/guild/:guildId/equalizer", async (req, res) => {
    try {
      const { guildId } = req.params;
      const { getLastEqualizer } = require("../database/repositories/GuildRepository");
      const current = await getLastEqualizer(guildId);
      res.json({
        success: true,
        data: {
          current: typeof current === 'string' ? current : "flat",
          presets: ["flat", "bass", "treble", "rock", "jazz", "pop", "edm", "classical"],
        },
      });
    } catch (error) {
      Logger.error("Error fetching equalizer:", error);
      res.json({ success: true, data: { current: "flat", presets: ["flat", "bass", "treble", "rock", "jazz", "pop", "edm", "classical"] } });
    }
  });

  // POST /api/guild/:guildId/equalizer — apply EQ preset
  app.post("/api/guild/:guildId/equalizer", async (req, res) => {
    try {
      const { guildId } = req.params;
      const { preset } = req.body;
      const userId = "dashboard";
      const userName = "Dashboard";
      const { setEqualizer } = require("../music/services/PlayerService");
      const { setLastEqualizer } = require("../database/repositories/GuildRepository");

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
      const ok = await setEqualizer(guildId, bands, userId, userName);
      if (ok) {
        await setLastEqualizer(guildId, preset);
      }
      res.json({ success: ok });
    } catch (error) {
      Logger.error("Error setting equalizer:", error);
      res.status(500).json({ success: false, error: "Failed to set equalizer" });
    }
  });

  // GET /api/guild/:guildId/insights — music analytics
  app.get("/api/guild/:guildId/insights", async (req, res) => {
    try {
      const { guildId } = req.params;
      const days = parseInt(req.query.days as string) || 7;
      const { getHistory } = require("../music/services/HistoryService");
      const history = await getHistory(guildId, 500);
      const cutoff = new Date(Date.now() - days * 86400000);
      const filtered = history.filter((h: any) => new Date(h.playedAt || h.timestamp) >= cutoff);

      const totalPlays = filtered.length;
      const uniqueUsers = new Set(filtered.map((h: any) => h.userId)).size;

      // Daily plays
      const dailyMap: Record<string, number> = {};
      filtered.forEach((h: any) => {
        const d = new Date(h.playedAt || h.timestamp).toISOString().split('T')[0];
        dailyMap[d] = (dailyMap[d] || 0) + 1;
      });
      const dailyPlays = Object.entries(dailyMap).map(([date, plays]) => ({ date, plays })).sort((a, b) => a.date.localeCompare(b.date));

      // Top tracks
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

      // Hourly activity
      const hourlyMap: Record<number, number> = {};
      for (let i = 0; i < 24; i++) hourlyMap[i] = 0;
      filtered.forEach((h: any) => {
        const hour = new Date(h.playedAt || h.timestamp).getHours();
        hourlyMap[hour]++;
      });
      const hourlyActivity = Object.entries(hourlyMap).map(([hour, plays]) => ({ hour: parseInt(hour), plays }));

      // Total playtime estimate (avg 3.5 min per play)
      const totalPlayTime = totalPlays * 210000;

      // Avg session (plays per unique user)
      const avgSession = uniqueUsers > 0 ? Math.round(totalPlays / uniqueUsers) : 0;

      res.json({
        success: true,
        data: {
          totalPlays,
          uniqueUsers,
          totalPlayTime,
          avgSession,
          dailyPlays,
          topTracks,
          hourlyActivity,
        },
      });
    } catch (error) {
      Logger.error("Error fetching insights:", error);
      res.json({ success: true, data: { totalPlays: 0, uniqueUsers: 0, totalPlayTime: 0, avgSession: 0, dailyPlays: [], topTracks: [], hourlyActivity: [] } });
    }
  });

  // GET /api/guild/:guildId/filter — get current filter state
  app.get("/api/guild/:guildId/filter", async (req, res) => {
    try {
      const { guildId } = req.params;
      const { getFilterState } = require("../music/services/PlayerService");
      const { getLastFilter } = require("../database/repositories/GuildRepository");
      const fm = getFilterState(guildId);
      const current = await getLastFilter(guildId);
      res.json({
        success: true,
        data: {
          current,
          filters: ["none", "nightcore", "vaporwave", "slowmo", "soft", "treble", "bassboost", "8d"],
        },
      });
    } catch (error) {
      Logger.error("Error fetching filter:", error);
      res.json({ success: true, data: { current: "none", filters: ["none", "nightcore", "vaporwave", "slowmo", "soft", "treble", "bassboost", "8d"] } });
    }
  });

  // POST /api/guild/:guildId/filter — apply or reset filter
  app.post("/api/guild/:guildId/filter", async (req, res) => {
    try {
      const { guildId } = req.params;
      const { filter } = req.body;
      const userId = "dashboard";
      const userName = "Dashboard";
      const { setFilter, resetFilters } = require("../music/services/PlayerService");
      const { setLastFilter } = require("../database/repositories/GuildRepository");

      let ok;
      if (!filter || filter === "none") {
        ok = await resetFilters(guildId, userId, userName);
      } else {
        ok = await setFilter(guildId, filter, userId, userName);
      }

      if (ok) {
        await setLastFilter(guildId, filter || "none");
      }

      res.json({ success: ok });
    } catch (error) {
      Logger.error("Error setting filter:", error);
      res.status(500).json({ success: false, error: "Failed to set filter" });
    }
  });

  // GET /api/guild/:guildId/health — voice channel health
  app.get("/api/guild/:guildId/health", async (req, res) => {
    try {
      const { guildId } = req.params;
      const engine = getEngine(guildId);
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

      res.json({
        success: true,
        data: {
          latency,
          channel: channelName,
          channelId: channel,
          status: player?.paused ? "Paused" : player?.playing ? "Playing" : channel !== "None" ? "Connected" : "Idle",
          playing: player?.playing || false,
          paused: player?.paused || false,
          lavalinkNode: player?.node?.name || "None",
          lavalinkRegion: region,
        },
      });
    } catch (error) {
      Logger.error("Error fetching health:", error);
      res.json({ success: true, data: { latency: 0, channel: "None", status: "Idle", playing: false, paused: false, lavalinkNode: "None", lavalinkRegion: "unknown" } });
    }
  });

  app.get("/api/guild/:guildId/nowplaying", async (req, res) => {
    try {
      const { guildId } = req.params;
      const engine = getEngine(guildId);
      const player = engine?.player;

      if (!player || (!player.playing && !player.paused)) {
        return res.json({ success: true, data: null });
      }

      const track = state.nowPlaying.get(guildId);
      if (!track) {
        return res.json({ success: true, data: null });
      }

      const thumb = track.info.artworkUrl || (track.info.identifier?.length === 11 ? `https://img.youtube.com/vi/${track.info.identifier}/maxresdefault.jpg` : null);

      res.json({
        success: true,
        data: {
          title: track.info.title,
          artist: track.info.artist,
          album: track.info.album || null,
          thumbnail: thumb,
          progress: ((player.position || 0) / (track.info.duration || 1)) * 100,
          duration: track.info.duration,
          current: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          requester: getRequesterId(track),
        },
      });
    } catch (error) {
      Logger.error("Error fetching nowplaying:", error);
      res.status(500).json({ success: false, error: "Failed to fetch now playing" });
    }
  });

  app.get("/api/guild/:guildId/queue", async (req, res) => {
    try {
      const { guildId } = req.params;
      const tracks = getQueue(guildId);
      const current = state.nowPlaying.get(guildId);
      const hasCurrent = !!current;

      res.json({
        success: true,
        data: {
          current: current ? formatTrack(current) : null,
          upcoming: (hasCurrent ? tracks.slice(1) : tracks).map(formatTrack),
          total: tracks.length,
        },
      });
    } catch (error) {
      Logger.error("Error fetching queue:", error);
      res.status(500).json({ success: false, error: "Failed to fetch queue" });
    }
  });

  app.get("/api/guild/:guildId/stats", async (req, res) => {
    try {
      const { guildId } = req.params;
      const engine = getEngine(guildId);
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

      res.json({
        success: true,
        data: {
          activeUsers,
          queueLength,
          uptime,
          playing: player?.playing || false,
          paused: player?.paused || false,
          status: player?.paused ? "Paused" : player?.playing ? "Playing" : "Idle",
        },
      });
    } catch (error) {
      Logger.error("Error fetching stats:", error);
      res.status(500).json({ success: false, error: "Failed to fetch stats" });
    }
  });

  // POST /api/guild/:guildId/player — player control (pause/resume/stop/skip/volume/seek/shuffle/loop)
  app.post("/api/guild/:guildId/player", async (req, res) => {
    try {
      const { guildId } = req.params;
      const { action, value } = req.body;
      // Ignore userId/userName from body — prevents impersonation via API
      const userId = "dashboard";
      const userName = "Dashboard";

      const playerService = require("../music/services/PlayerService");
      const { getEngine } = playerService;

      switch (action) {
        case "pause":
          await playerService.pause(guildId, userId, userName);
          res.json({ success: true });
          break;
        case "resume":
          await playerService.resume(guildId, userId, userName);
          res.json({ success: true });
          break;
        case "stop":
          await playerService.stop(guildId, userId, userName);
          res.json({ success: true });
          break;
        case "skip":
          await playerService.skip(guildId, userId, userName);
          res.json({ success: true });
          break;
        case "volume":
          playerService.setVolume(guildId, value ?? 100, userId, userName);
          res.json({ success: true });
          break;
        case "seek":
          playerService.seek(guildId, value ?? 0, userId, userName);
          res.json({ success: true });
          break;
        default:
          res.status(400).json({ success: false, error: `Unknown action: ${action}` });
      }
    } catch (error) {
      Logger.error("Error in player action:", error);
      res.status(500).json({ success: false, error: "Player action failed" });
    }
  });

  // GET /api/guild/:guildId/lyrics — fetch lyrics for current track
  app.get("/api/guild/:guildId/lyrics", async (req, res) => {
    try {
      const { guildId } = req.params;
      const { fetchLyrics } = require("../music/services/LyricsService");
      const { getEngine } = require("../music/services/PlayerService");
      const engine = getEngine(guildId);
      const player = engine?.player;

      if (!player || (!player.playing && !player.paused)) {
        return res.json({ success: true, data: null });
      }

      const track = state.nowPlaying.get(guildId);
      if (!track) {
        return res.json({ success: true, data: null });
      }

      const lyrics = await fetchLyrics(track);
      if (!lyrics) {
        return res.json({ success: true, data: null });
      }

      res.json({
        success: true,
        data: {
          track: {
            title: track.info.title,
            artist: track.info.author || track.info.artist || "",
            album: track.info.album || null,
            thumbnail: track.info.artworkUrl || (track.info.identifier?.length === 11 ? `https://img.youtube.com/vi/${track.info.identifier}/maxresdefault.jpg` : null),
          },
          text: lyrics.text,
          source: lyrics.source,
          synced: lyrics.synced || null,
        },
      });
    } catch (error) {
      Logger.error("Error fetching lyrics:", error);
      res.json({ success: true, data: null });
    }
  });

  // GET /api/activities/:guildId — activity history
  app.get("/api/activities/:guildId", async (req, res) => {
    try {
      const { guildId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;
      const { getHistory } = require("../music/services/HistoryService");
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
      res.json({ success: true, data });
    } catch (error) {
      Logger.error("Error fetching activities:", error);
      res.json({ success: true, data: [] });
    }
  });

  // GET /api/guild/:guildId/dj-check/:userId — check if user has DJ role
  app.get("/api/guild/:guildId/dj-check/:userId", async (req, res) => {
    try {
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

      res.json({ success: true, isDj });
    } catch (error) {
      Logger.error("Error checking DJ:", error);
      res.json({ success: true, isDj: false });
    }
  });

  // GET /api/status — bot status
  app.get("/api/status", (_req, res) => {
    const client = getClient();
    const lavalink = getLavalink();
    const connectedNodes = lavalink?.nodeManager
      ? Array.from(lavalink.nodeManager.nodes.values()).filter((n: any) => n.connected).length
      : 0;

    const mongoose = require("mongoose");
    const dbReady = mongoose.connection?.readyState === 1;

    res.json({
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
  });

  app.get("/api/metrics", (_req, res) => {
    const { getMetrics } = require("../telemetry/MetricsCollector");
    res.json({ success: true, data: getMetrics() });
  });

  const port = Config.apiPort;
  app.listen(port, Config.apiHost, () => {
    Logger.ready(`API server on ${Config.apiHost}:${port}`);
  });
}
