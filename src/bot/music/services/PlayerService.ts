import state from "../../core/state/StateManager";
import QueueEngine from "../engine/QueueEngine";
import { PlaybackEngine } from "../engine/PlaybackEngine";
import { deleteTextChannelId } from "./TextChannelStore";

interface Engine {
  guildId: string;
  player: any;
  playback: PlaybackEngine;
  queue: QueueEngine;
  join: (voiceChannelId: string, textChannelId: string | null) => Promise<any>;
  getCurrentTrack: () => any;
}

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
      join: async (voiceChannelId: string, textChannelId: string | null) => {
        const { get } = require("../engine/lavalink");
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
        });
        await player.connect();
        e!.player = player;
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
  const { stopPositionSync, deleteState } = require("./StateService");
  stopPositionSync(guildId);
  await deleteState(guildId).catch(() => {});
  const e = engines.get(guildId);
  if (e?.player) {
    try { await e.player.destroy(); } catch {}
  }
  engines.delete(guildId);
  deleteTextChannelId(guildId);
  state.nowPlaying.delete(guildId);
  state.queues.clear(guildId);
  state.loop.delete(guildId);
}

// Stub exports so MusicService re-export doesn't fail
export async function play(_guildId: string, _query: string, _user: any): Promise<any> {}
export async function skip(guildId: string, userId: string, userName: string): Promise<any> {
  const engine = getEngine(guildId);
  const player = engine.player;
  const nextTrack = await engine.playback.skip();
  const { saveState, deleteState } = require("./StateService");
  const { stopPositionSync } = require("./StateService");
  if (nextTrack) {
    const ActivityService = require("../../services/ActivityService").default;
    await ActivityService.log({ guildId, userId, userName, action: "skip", detail: `Skipped to ${nextTrack.info?.title || "next track"}`, songTitle: nextTrack?.info?.title, artist: nextTrack?.info?.artist });
    await saveState(guildId);
  } else {
    await deleteState(guildId).catch(() => {});
    stopPositionSync(guildId);
    if (player) {
      try { player.disconnect(); } catch {}
      try { player.destroy(); } catch {}
    }
  }
  return nextTrack;
}
export async function stop(guildId: string, userId: string, userName: string): Promise<void> {
  const engine = getEngine(guildId);
  const player = engine.player;
  await engine.playback.stop();
  const { deleteState } = require("./StateService");
  await deleteState(guildId).catch(() => {});
  const { stopPositionSync } = require("./StateService");
  stopPositionSync(guildId);
  // Disconnect from voice channel
  if (player) {
    try { player.disconnect(); } catch {}
    try { player.destroy(); } catch {}
  }
  const ActivityService = require("../../services/ActivityService").default;
  await ActivityService.log({ guildId, userId, userName, action: "stop", detail: "Stopped playback" });
}
export function seek(guildId: string, position: number, userId: string, userName: string): boolean {
  try {
    const { get } = require("../engine/lavalink");
    const player = get()?.players?.get(guildId);
    if (!player) return false;
    player.seek(position);
    const ActivityService = require("../../services/ActivityService").default;
    ActivityService.log({ guildId, userId, userName, action: "seek", detail: `Seeked to ${position}ms` }).catch(() => {});
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
  const { withQueueLock } = require("../../core/state/QueueLock");
  const engine = getEngine(guildId);
  await withQueueLock(guildId, async () => {
    engine.queue.addMultiple(tracks);
    if (!engine.player?.playing && !engine.player?.paused) {
      const first = engine.queue.next();
      if (first) {
        state.nowPlaying.set(guildId, first);
        await engine.player?.play({ track: first, clientTrack: first });

        const { saveState } = require("./StateService");
        await saveState(guildId);
      }
    }
  });
}
const FILTER_CONFIGS: Record<string, (fm: any) => Promise<any>> = {
  nightcore: async (fm) => { await fm.setSpeed(1.3); await fm.setPitch(1.3); await fm.setRate(1); },
  vaporwave: async (fm) => { await fm.setSpeed(0.85); await fm.setPitch(0.85); await fm.setRate(1); },
  slowmo: async (fm) => { await fm.setSpeed(0.7); await fm.setPitch(0.9); await fm.setRate(1); },
  soft: async (fm) => { await fm.setVolume(0.5); },
  treble: async (fm) => { await fm.setEQ(Array.from({ length: 15 }, (_, i) => ({ band: i, gain: i < 7 ? 0 : 0.15 }))); },
  bassboost: async (fm) => { await fm.setEQ(Array.from({ length: 15 }, (_, i) => ({ band: i, gain: i < 5 ? 0.35 - i * 0.08 : -0.05 }))); },
  "8d": async (fm) => { await fm.toggleRotation(0.15); },
};

export async function setFilter(guildId: string, filter: string, _userId: string, _userName: string): Promise<boolean> {
  const engine = getEngine(guildId);
  if (!engine.player) return false;
  try {
    const fm = engine.player.filterManager;
    await fm.resetFilters();
    const apply = FILTER_CONFIGS[filter];
    if (apply) await apply(fm);
    await fm.applyPlayerFilters();
    return true;
  } catch { return false; }
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
  const { get } = require("../engine/lavalink");
  const player = get()?.players?.get(guildId);
  if (!player) return { tracks: [] };
  return player.search({ query }, user);
}
