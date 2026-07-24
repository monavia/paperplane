import Logger from "../../core/utils/Logger.js";
import state from "../../core/state/StateManager.js";
import { saveSpotifyMeta, applySpotifyMeta } from "../services/TitleResolver.js";
import { getTextChannelId } from "../services/TextChannelStore.js";
import { getEngine } from "../services/PlayerService.js";
import { getBestNode, recordDisconnect, recordError } from "./NodePenaltyService.js";
import { setFilter, setEqualizer } from "../services/PlayerService.js";
import { searchWithRetry } from "../services/SearchService.js";
import type { LavalinkManager } from "lavalink-client" with { "resolution-mode": "require" };

let lavalink: LavalinkManager | null = null;
let clientRef: any = null;

export function setLavalinkRef(l: LavalinkManager | null, client?: any): void {
  lavalink = l;
  if (client) clientRef = client;
}

const globalFailoverLocks = new Set<string>();
const failoverGuilds = new Set<string>();

export function isFailoverGuild(guildId: string): boolean {
  return failoverGuilds.has(guildId);
}
export function clearFailoverGuild(guildId: string): void {
  failoverGuilds.delete(guildId);
}

export async function connectWithRetry(player: any, guildId: string, retries = 3): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await player.connect();
      return;
    } catch (err: any) {
      if (i < retries - 1) {
        Logger.warn(`[NodeLink] connect failed for ${guildId} (${i + 1}/${retries}): ${err?.message}, retrying in 2s`);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }
}

const trackCache = new Map<string, { encoded: string; ts: number }>();

const TRACK_CACHE_TTL_MS = 60 * 60 * 1000;

export function cacheTrack(guildId: string, track: any): void {
  if (track?.encoded) trackCache.set(guildId, { encoded: track.encoded, ts: Date.now() });
}
export function getCachedTrack(guildId: string): string | null {
  const entry = trackCache.get(guildId);
  if (!entry) return null;
  if (Date.now() - entry.ts > TRACK_CACHE_TTL_MS) {
    trackCache.delete(guildId);
    return null;
  }
  return entry.encoded;
}
export function clearTrackCache(guildId: string): void {
  trackCache.delete(guildId);
}
export function pruneTrackCache(): void {
  const now = Date.now();
  for (const [guildId, entry] of trackCache.entries()) {
    if (now - entry.ts > TRACK_CACHE_TTL_MS) trackCache.delete(guildId);
  }
}

export async function failoverFromNode(nodeId: string) {
  if (!lavalink?.nodeManager) return;

  for (const [guildId, player] of lavalink.players) {
    if (player.node?.id !== nodeId) continue;
    if (globalFailoverLocks.has(guildId)) continue;
    globalFailoverLocks.add(guildId);
    failoverGuilds.add(guildId);

    recordDisconnect(nodeId);
    const target = getBestNode(lavalink);
    if (!target || target.id === nodeId) {
      Logger.warn(`[NodeLink] Failover: no healthy nodes for guild ${guildId}`);
      continue;
    }

    if (!target.sessionId) {
      Logger.warn(`[NodeLink] Failover: target ${target.id} no session yet — skip ${guildId}`);
      continue;
    }

    try {
      await player.changeNode(target.id, false);
      Logger.info(`[NodeLink] Failover: moved player ${guildId} from node=${nodeId} region=${player.node?.options?.regions?.[0] || "?"} → node=${target.id} region=${target.options?.regions?.[0] || "?"}`);
      const curTrack = state.nowPlaying.get(guildId);
      if (curTrack && !player.playing) {
        const encoded = curTrack?.encoded || getCachedTrack(guildId);
        if (encoded) {
          await (player.play as any)({ encoded, position: player.position || 0 }).catch(Logger.safe("bot/music/engine/FailoverManager.ts"));
        } else if (curTrack.info?.uri) {
          const uri = curTrack.info.uri;
          const isSpotify = /^spotify:(track|album|playlist):/.test(uri) || /open\.spotify\.com/i.test(uri);
          const savedMeta = saveSpotifyMeta(curTrack);
          let resolved: any = null;
          if (isSpotify) {
            const q = `${curTrack.info.author || ""} ${curTrack.info.title || ""}`.trim();
            for (const prefix of ["ytmsearch", "ytsearch", "scsearch"]) {
              const search = await searchWithRetry(player, { query: `${prefix}:${q}` }, { id: "system" }).catch(() => null);
              if (search?.tracks?.length) { resolved = search.tracks.find((t: any) => t.info?.sourceName !== "deezer") || search.tracks[0]; if (resolved) break; }
            }
          } else {
            const search = await searchWithRetry(player, { query: uri }, { id: "system" }).catch(() => null);
            if (search?.tracks?.length) {
              const preferred = search.tracks.find((t: any) => t.info?.sourceName === "youtube" || t.info?.sourceName === "ytmusic");
              resolved = preferred || search.tracks.find((t: any) => t.info?.sourceName !== "deezer") || search.tracks[0];
            }
          }
          if (resolved) {
            applySpotifyMeta(resolved, savedMeta);
            await player.play({ track: resolved, clientTrack: resolved, position: player.position || 0 }).catch(Logger.safe("bot/music/engine/FailoverManager.ts"));
          }
        }
        getEngine(guildId).player = player;
        const savedFilter = state.filter.get(guildId);
        if (savedFilter && savedFilter !== "none") {
          setFilter(guildId, savedFilter, "system", "System").catch(Logger.safe("bot/music/engine/FailoverManager.ts"));
        }
        const savedBands = state.equalizer.get(guildId);
        if (savedBands) {
          setEqualizer(guildId, savedBands, "system", "System").catch(Logger.safe("bot/music/engine/FailoverManager.ts"));
        }
      }
    } catch (err: any) {
      Logger.warn(`[NodeLink] Failover: changeNode failed for ${guildId} (${err.message?.slice(0,80) || "?"}) — retrying with destroy`);
      try {
        await player.changeNode(target.id, true);
        Logger.info(`[NodeLink] Failover: retry changeNode succeeded for ${guildId} to ${target.id}`);
      } catch (err2: any) {
        Logger.warn(`[NodeLink] Failover: changeNode retry failed for ${guildId} (${err2.message?.slice(0,80) || "?"}) — recreating player`);
        try {
          const savedPos = player.position || 0;
          const track = state.nowPlaying.get(guildId);
          const vcId = player.voiceChannelId;
          if (!vcId) continue;
          await player.destroy().catch(Logger.safe("bot/music/engine/FailoverManager.ts"));
          const newPlayer = lavalink.createPlayer({
            guildId,
            voiceChannelId: vcId,
            textChannelId: getTextChannelId(guildId) || "",
            selfDeaf: true,
            selfMute: false,
          });
          await newPlayer.connect();
          const encoded = track?.encoded || getCachedTrack(guildId);
          if (encoded) {
            await (newPlayer.play as any)({ encoded, position: savedPos }).catch(Logger.safe("bot/music/engine/FailoverManager.ts"));
          } else if (track?.info?.uri) {
            const uri = track.info.uri;
            const isSpotify = /^spotify:(track|album|playlist):/.test(uri) || /open\.spotify\.com/i.test(uri);
            const savedMeta = saveSpotifyMeta(track);
            let resolved: any = track;
            if (isSpotify) {
              const q = `${track.info.author || ""} ${track.info.title || ""}`.trim();
              for (const prefix of ["ytmsearch", "ytsearch", "scsearch"]) {
                const search = await searchWithRetry(newPlayer, { query: `${prefix}:${q}` }, { id: "system" }).catch(() => null);
                if (search?.tracks?.length) { resolved = search.tracks.find((t: any) => t.info?.sourceName !== "deezer") || search.tracks[0]; if (resolved) break; }
              }
            } else {
              const search = await searchWithRetry(newPlayer, { query: uri }, { id: "system" }).catch(() => null);
              if (search?.tracks?.length) {
                const preferred = search.tracks.find((t: any) => t.info?.sourceName === "youtube" || t.info?.sourceName === "ytmusic");
                resolved = preferred || search.tracks.find((t: any) => t.info?.sourceName !== "deezer") || search.tracks[0];
              }
            }
            applySpotifyMeta(resolved, savedMeta);
            await newPlayer.play({ track: resolved, clientTrack: resolved, position: savedPos });
          }
          getEngine(guildId).player = newPlayer;
          const savedFilter = state.filter.get(guildId);
          if (savedFilter && savedFilter !== "none") {
            setFilter(guildId, savedFilter, "system", "System").catch(Logger.safe("bot/music/engine/FailoverManager.ts"));
          }
          const savedBands = state.equalizer.get(guildId);
          if (savedBands) {
            setEqualizer(guildId, savedBands, "system", "System").catch(Logger.safe("bot/music/engine/FailoverManager.ts"));
          }
          Logger.info(`[NodeLink] Failover: recreated player ${guildId} (auto node)`);
        } catch (err2: any) { Logger.warn(`[NodeLink] Failover: recreate failed for ${guildId}: ${err2.message}`); }
      }
    }
    globalFailoverLocks.delete(guildId);
  }
}
