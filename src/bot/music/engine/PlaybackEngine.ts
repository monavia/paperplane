import { getPlayer, createPlayer } from "./PlayerManager.js";
import { markManualAdvance } from "./musicEvents.js";
import { withQueueLock } from "../../core/state/QueueLock.js";
import state from "../../core/state/StateManager.js";
import Logger from "../../core/utils/Logger.js";

export class PlaybackEngine {
  guildId: string;
  autoplay: boolean = false;

  constructor(guildId: string) {
    this.guildId = guildId;
  }

  get player(): any {
    return getPlayer(this.guildId);
  }

  async play(track: any): Promise<boolean> {
    const player = this.player || createPlayer(this.guildId, null, null);
    if (!player) return false;
    try {
      await player.play({ track, clientTrack: track });
    } catch (err: any) {
      if (err?.message?.includes?.("not connected to the Lavalink")) throw new Error("Engine music is offline, try again 1 minutes.");
      throw err;
    }
    return true;
  }

  async skip(): Promise<any> {
    const player = this.player;
    if (!player) return null;

    return withQueueLock(this.guildId, async () => {
      let nextTrack: any = null;
      const queue = state.queues.get(this.guildId) || [];
      while (queue.length > 0) {
        const candidate = queue.shift();
        if (!candidate?.encoded && candidate?.info?.uri) {
          try {
            const res = await player.search({ query: candidate.info.uri, source: "ytsearch" }).catch(() => null);
            if (res?.tracks?.[0]?.encoded) Object.assign(candidate, res.tracks[0]);
          } catch { /* use as-is */ }
        }
        if (candidate?.encoded) {
          nextTrack = candidate;
          break;
        }
        Logger.warn(`[skip] guild=${this.guildId} skipping unplayable track: ${candidate?.info?.title || "?"}`);
      }
      state.queues.set(this.guildId, queue);

      if (nextTrack) {
        state.nowPlaying.set(this.guildId, nextTrack);
        markManualAdvance(this.guildId);
        try {
          await player.play({ track: nextTrack, clientTrack: nextTrack });
        } catch (err: any) {
          if (err?.message?.includes?.("not connected to the Lavalink")) throw new Error("Engine music is offline, try again 1 minutes.");
          throw err;
        }
      } else {
        await player.stopPlaying();
      }
      return nextTrack || null;
    });
  }

  async stop(): Promise<boolean> {
    const player = this.player;
    if (!player) return false;

    return withQueueLock(this.guildId, async () => {
      state.nowPlaying.delete(this.guildId);
      state.queues.clear(this.guildId);
      await player.stopPlaying();
      return true;
    });
  }

  async pause(): Promise<boolean> {
    const player = this.player;
    if (!player || !player.playing) return false;
    await player.pause();
    return true;
  }

  async resume(): Promise<boolean> {
    const player = this.player;
    if (!player || player.playing) return false;
    await player.resume();
    return true;
  }

  setVolume(volume: number): boolean {
    const player = this.player;
    if (!player) return false;
    player.setVolume(volume);
    return true;
  }
}
