import Logger from "../../core/utils/Logger.js";
import state from "../../core/state/StateManager.js";
import QueueEngine from "../engine/QueueEngine.js";
import { PlaybackEngine } from "../engine/PlaybackEngine.js";
import { deleteTextChannelId } from "./TextChannelStore.js";
import { saveState, deleteState, stopPositionSync } from "./StateService.js";
import { get, connectWithRetry } from "../engine/lavalink.js";
import { deletePlayerData } from "../services/PersistentPlayerStore.js";
import { setAutoplay, setLastFilter, setShuffle, setLastEqualizer } from "../../database/repositories/GuildRepository.js";
import { withQueueLock } from "../../core/state/QueueLock.js";
import ActivityService from "../../services/ActivityService.js";
import { resolveEQBands } from "../../core/constants/EQPresets.js";

interface Engine {
  guildId: string;
  player: any;
  playback: PlaybackEngine;
  queue: QueueEngine;
  join: (voiceChannelId: string, textChannelId: string | null, vcRegion?: string) => Promise<any>;
  getCurrentTrack: () => any;
}

// Wire QueueStore sync → player.queue (for MongoQueueStore persistence)
state.queues.setPlayerGetter((guildId: string) => {
  const mgr = get();
  return mgr?.players?.get(guildId) || null;
});

const engines = new Map<string, Engine>();

// Periodic cleanup: remove engines with no player and no queue (idle)
setInterval(() => {
  for (const [guildId, e] of engines) {
    if (!e.player && e.queue.size() === 0) {
      engines.delete(guildId);
    }
  }
}, 300000); // every 5 min

export function getEngine(guildId: string): Engine {
  let e = engines.get(guildId);
  if (!e) {
    const pb = new PlaybackEngine(guildId);
    const q = new QueueEngine(guildId);
    e = {
      guildId,
      player: null as any,
      playback: pb,
      queue: q,
      join: async (voiceChannelId: string, textChannelId: string | null, vcRegion?: string) => {
        
        const lavalink = get();
        if (!lavalink) throw new Error("Lavalink not connected");
        const existing = lavalink.players.get(guildId);
        if (existing) {
          e!.player = existing;
          return existing;
        }
        const player = lavalink.createPlayer({
          guildId,
          voiceChannelId,
          textChannelId: textChannelId || "",
          selfDeaf: true,
          selfMute: false,
          ...(vcRegion ? { vcRegion } : {}),
        });
        await connectWithRetry(player, guildId);
        e!.player = player;
        // Sync any pre-join RAM queue data to player.queue (queueStore persists it)
        state.queues.syncToPlayer(guildId);
        Logger.info(`[VoiceJoin] guild=${guildId} vc=${voiceChannelId} vcRegion=${vcRegion || "?"} node=${player.node?.id || "?"} nodeRegion=${player.node?.options?.regions?.[0] || "?"}`);
        return player;
      },
      getCurrentTrack: () => {
        const p = e!.player;
        if (!p) return null;
        return state.nowPlaying.get(guildId) || p.queue?.current || null;
      },
    };
    engines.set(guildId, e);
  }
  return e;
}

export async function destroyEngine(guildId: string): Promise<void> {
  
  await stopPositionSync(guildId);
  await deleteState(guildId).catch(Logger.safe("bot/music/services/PlayerService.ts"));
  const e = engines.get(guildId);
  if (e?.player) {
    try { await e.player.destroy(); } catch { Logger.safe("PlayerService")(); }
  }
  engines.delete(guildId);
  deleteTextChannelId(guildId);
  
  deletePlayerData(guildId);
  state.position.delete(guildId);
  state.nowPlaying.delete(guildId);
  state.queues.clear(guildId);
  state.loop.delete(guildId);
  if (!state.twentyFourSeven.isEnabled(guildId)) {
    state.autoplay.delete(guildId);
    setAutoplay(guildId, false).catch(Logger.safe("bot/music/services/PlayerService.ts"));
    state.shuffle.delete(guildId);
    setShuffle(guildId, false).catch(Logger.safe("bot/music/services/PlayerService.ts"));
    state.filter.delete(guildId);
    setLastFilter(guildId, "none").catch(Logger.safe("bot/music/services/PlayerService.ts"));
    state.equalizer.delete(guildId);
    setLastEqualizer(guildId, "flat").catch(Logger.safe("bot/music/services/PlayerService.ts"));
  }
}

// Stub exports so MusicService re-export doesn't fail
export async function play(_guildId: string, _query: string, _user: any): Promise<any> {}
export async function skip(guildId: string, userId: string, userName: string): Promise<any> {
  const engine = getEngine(guildId);
  const player = engine.player;
  const nextTrack = await engine.playback.skip();
  
  
  
  if (nextTrack) {
    
    await ActivityService.log({ guildId, userId, userName, action: "skip", detail: `Skipped to ${nextTrack.info?.title || "next track"}`, songTitle: nextTrack?.info?.title, artist: nextTrack?.info?.artist });
    await saveState(guildId);
  } else if (!state.autoplay.get(guildId)) {
    if (!state.twentyFourSeven.isEnabled(guildId)) {
      await deleteState(guildId).catch(Logger.safe("bot/music/services/PlayerService.ts"));
      await stopPositionSync(guildId);
      if (player) {
        try { player.disconnect(); } catch { Logger.safe("PlayerService")(); }
        try { player.destroy(); } catch { Logger.safe("PlayerService")(); }
      }
    }
    state.loop.delete(guildId);
    state.shuffle.delete(guildId);
  }
  return nextTrack;
}
export async function stop(guildId: string, userId: string, userName: string): Promise<void> {
  const engine = getEngine(guildId);
  const player = engine.player;
  await engine.playback.stop();

  await deleteState(guildId).catch(Logger.safe("bot/music/services/PlayerService.ts"));
  
  await stopPositionSync(guildId);
  
  if (!state.twentyFourSeven.isEnabled(guildId)) {
    state.autoplay.set(guildId, false);
    setAutoplay(guildId, false).catch(Logger.safe("bot/music/services/PlayerService.ts"));
    state.filter.delete(guildId);
    setLastFilter(guildId, "none").catch(Logger.safe("bot/music/services/PlayerService.ts"));
    state.shuffle.delete(guildId);
    setShuffle(guildId, false).catch(Logger.safe("bot/music/services/PlayerService.ts"));
    state.equalizer.delete(guildId);
    setLastEqualizer(guildId, "flat").catch(Logger.safe("bot/music/services/PlayerService.ts"));
  }

  const nodeDead = player && !player.node?.connected;
  if (player) {
    if (nodeDead && state.twentyFourSeven.isEnabled(guildId)) {
      // 247 ON + dead node: destroy broken player, rejoin to stay in VC
      try { player.disconnect(); } catch { Logger.safe("PlayerService")(); }
      try { player.destroy(); } catch { Logger.safe("PlayerService")(); }
      const vcData = state.voiceChannels.get(guildId);
      if (vcData) {
        try {
          await engine.join(vcData.voiceChannelId, vcData.textChannelId);
          if (state.filter.isActive(guildId)) {
            applyFilters(guildId).catch(Logger.safe("bot/music/services/PlayerService.ts"));
          }
          const savedBands = state.equalizer.get(guildId);
          const bands = resolveEQBands(savedBands);
          if (bands) {
            setEqualizer(guildId, bands, "system", "System").catch(Logger.safe("bot/music/services/PlayerService.ts"));
          }
        } catch (err: any) {
          Logger.warn(`[247-Stop] Rejoin failed for ${guildId}: ${err?.message}`);
        }
      }
    } else if (!state.twentyFourSeven.isEnabled(guildId)) {
      // Normal stop, 247 OFF
      try { player.disconnect(); } catch { Logger.safe("PlayerService")(); }
      try { player.destroy(); } catch { Logger.safe("PlayerService")(); }
    }
    // 247 ON + healthy: no-op
  }
  
  await ActivityService.log({ guildId, userId, userName, action: "stop", detail: "Stopped playback" });
}
export function seek(guildId: string, position: number, userId: string, userName: string): boolean {
  try {
    
    const player = get()?.players?.get(guildId);
    if (!player) return false;
    player.seek(position);
    
    ActivityService.log({ guildId, userId, userName, action: "seek", detail: `Seeked to ${position}ms` }).catch(Logger.safe("bot/music/services/PlayerService.ts"));
    return true;
  } catch { return false; }
}
export async function pause(guildId: string, _userId: string, _userName: string): Promise<boolean> {
  const engine = getEngine(guildId);
  return engine.playback.pause();
}
export async function resume(guildId: string, _userId: string, _userName: string): Promise<boolean> {
  const engine = getEngine(guildId);
  return engine.playback.resume();
}
export function setVolume(guildId: string, volume: number, _userId: string, _userName: string): boolean {
  const engine = getEngine(guildId);
  return engine.playback.setVolume(volume);
}
export async function resolveAndQueueTracks(guildId: string, tracks: any[], user: any): Promise<void> {
  
  const engine = getEngine(guildId);
  await withQueueLock(guildId, async () => {
    engine.queue.addMultiple(tracks);
    if (!engine.player?.playing && !engine.player?.paused) {
      const first = engine.queue.next();
      if (first) {
        state.nowPlaying.set(guildId, first);
        await engine.player?.play({ track: first, clientTrack: first });

        
        await saveState(guildId);
      }
    }
  });
}
/** Filter property families — filters in the same family conflict (last wins) */
const FILTER_FAMILIES: Record<string, string> = {
  nightcore: "speed", vaporwave: "speed", slowmo: "speed",
  soft: "volume",
  treble: "eq", bassboost: "eq",
  "8d": "rotation",
};

const FILTER_CONFIGS: Record<string, (fm: any) => Promise<any>> = {
  nightcore: async (fm) => { await fm.setSpeed(1.3); await fm.setPitch(1.3); await fm.setRate(1); },
  vaporwave: async (fm) => { await fm.setSpeed(0.85); await fm.setPitch(0.85); await fm.setRate(1); },
  slowmo: async (fm) => { await fm.setSpeed(0.7); await fm.setPitch(0.9); await fm.setRate(1); },
  soft: async (fm) => { await fm.setVolume(0.5); },
  treble: async (fm) => { await fm.setEQ(Array.from({ length: 15 }, (_, i) => ({ band: i, gain: i < 7 ? 0 : 0.15 }))); },
  bassboost: async (fm) => { await fm.setEQ(Array.from({ length: 15 }, (_, i) => ({ band: i, gain: i < 5 ? 0.35 - i * 0.08 : -0.05 }))); },
  "8d": async (fm) => { await fm.toggleRotation(0.15); },
};

/**
 * Apply all active filters (from FilterStore) to the player's filter manager.
 * Handles stacking: filters in different property families are additive.
 * Filters in the same family: only the last one wins.
 */
export async function applyFilters(guildId: string): Promise<boolean> {
  const engine = getEngine(guildId);
  if (!engine.player) return false;
  try {
    const fm = engine.player.filterManager;
    await fm.resetFilters();
    const active = state.filter.get(guildId);
    if (!active.length) { await fm.applyPlayerFilters(); return true; }

    // Group by family, keep only the last filter per family
    const byFamily: Record<string, string> = {};
    for (const f of active) {
      const family = FILTER_FAMILIES[f] || "other";
      byFamily[family] = f;
    }

    // Apply one filter per family
    for (const f of Object.values(byFamily)) {
      const apply = FILTER_CONFIGS[f];
      if (apply) await apply(fm);
    }
    await fm.applyPlayerFilters();
    return true;
  } catch { return false; }
}

/**
 * Toggle a named filter on/off for a guild.
 * Returns the new toggle state (true = on).
 */
export async function toggleFilter(guildId: string, filter: string, _userId: string, _userName: string): Promise<boolean> {
  const engine = getEngine(guildId);
  if (!engine.player) return false;
  const on = state.filter.toggle(guildId, filter);
  await applyFilters(guildId);
  return on;
}

export async function setFilter(guildId: string, filter: string, _userId: string, _userName: string): Promise<boolean> {
  const engine = getEngine(guildId);
  if (!engine.player) return false;
  state.filter.set(guildId, filter === "none" ? [] : [filter]);
  await applyFilters(guildId);
  return true;
}

export async function setEqualizer(guildId: string, bands: any[], _userId: string, _userName: string): Promise<boolean> {
  const engine = getEngine(guildId);
  if (!engine.player) return false;
  try {
    const fm = engine.player.filterManager;
    await fm.resetFilters();
    await fm.setEQ(bands);
    await fm.applyPlayerFilters();
    return true;
  } catch { return false; }
}

export async function resetFilters(guildId: string, _userId: string, _userName: string): Promise<boolean> {
  const engine = getEngine(guildId);
  if (!engine.player) return false;
  try {
    state.filter.clear(guildId);
    await engine.player.filterManager.resetFilters();
    return true;
  } catch { return false; }
}

export function getFilterState(guildId: string): any {
  const engine = getEngine(guildId);
  return engine.player?.filterManager || null;
}
export async function playSoundboard(_guildId: string, _url: string, _userId: string, _userName: string): Promise<boolean> { return false; }
export async function search(guildId: string, query: string, user: any): Promise<any> {
  
  const player = get()?.players?.get(guildId);
  if (!player) return { tracks: [] };
  return player.search({ query }, user);
}
