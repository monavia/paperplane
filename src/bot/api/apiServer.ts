import express from "express";
import Config from "../config/bot";
import Logger from "../core/utils/Logger";
import { getEngine } from "../music/services/PlayerService";
import { getQueue } from "../music/services/QueueService";
import { getClient } from "../music/engine/lavalink";
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
  const thumb = track.info.artworkUrl || (track.info.identifier?.length === 11 ? `https://img.youtube.com/vi/${track.info.identifier}/maxresdefault.jpg` : null);
  return {
    title: track.info.title,
    artist: track.info.artist,
    duration: track.info.duration || 0,
    uri: track.info.uri,
    thumbnail: thumb,
    requester: getRequesterId(track),
  };
}

export async function startApiServer(_status?: any): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(requireApiAuth);

  app.get("/api/health", (_req, res) => {
    const client = getClient();
    res.json({
      status: "ok",
      uptime: process.uptime(),
      guilds: client?.guilds?.cache?.size || 0,
    });
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

  const port = Config.apiPort;
  app.listen(port, Config.apiHost, () => {
    Logger.ready(`API server on ${Config.apiHost}:${port}`);
  });
}
