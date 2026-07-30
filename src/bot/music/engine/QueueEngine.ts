import state from "../../core/state/StateManager.js";
import { isDead, deadFingerprint, deadSpotifyFingerprint } from "../../cache/DeadTrackService.js";
import Logger from "../../core/utils/Logger.js";

/**
 * QueueEngine — thin wrapper over state.queues for a single guild.
 *
 * IMPORTANT: These methods do NOT acquire withQueueLock internally.
 * All callers MUST hold the lock before calling mutating methods
 * (add, addMultiple, next, remove, swap, shuffle, move, removeRange, clear)
 * to prevent races with advanceQueue / skip / trackError.
 */

function _removeFromQueue(guildId: string, track: any): void {
  const q = state.queues.get(guildId);
  const idx = q.indexOf(track);
  if (idx !== -1) {
    q.splice(idx, 1);
    state.queues.set(guildId, q);
  }
}

class QueueEngine {
  guildId: string;

  constructor(guildId: string) {
    this.guildId = guildId;
  }

  add(track: any): void {
    const q = state.queues.get(this.guildId);
    q.push(track);
    state.queues.set(this.guildId, q);
    this._validateAddedTrack(track);
  }

  private _validateAddedTrack(track: any): void {
    const fp = track.info?.title ? deadFingerprint(track.info.title, track.info.author) : null;
    if (fp) {
      isDead(fp).then(dead => {
        if (!dead) return;
        _removeFromQueue(this.guildId, track);
        Logger.warn(`[QueueEngine] guild=${this.guildId} skipping dead track at add: ${track.info?.title || "?"}`);
      });
    }

    if (track.info?.uri) {
      const isSpotifyTrack = /^spotify:track:|open\.spotify\.com\/track\//.test(track.info.uri);
      if (isSpotifyTrack) {
        const m = track.info.uri.match(/([a-zA-Z0-9]+)$/);
        if (m) {
          isDead(deadSpotifyFingerprint(m[1])).then(dead => {
            if (!dead) return;
            _removeFromQueue(this.guildId, track);
            Logger.warn(`[QueueEngine] guild=${this.guildId} skipping dead Spotify track at add: ${m[1]}`);
          });
        }
      }
    }
  }

  addMultiple(tracks: any[]): void {
    for (const t of tracks) this.add(t);
  }

  next(): any {
    const q = state.queues.get(this.guildId);
    const first = q.shift();
    state.queues.set(this.guildId, q);
    return first || null;
  }

  peek(): any {
    const q = state.queues.get(this.guildId);
    return q.length ? q[0] : null;
  }

  getAll(): any[] {
    return state.queues.get(this.guildId);
  }

  remove(index: number): any {
    const q = state.queues.get(this.guildId);
    const removed = q.splice(index, 1);
    state.queues.set(this.guildId, q);
    return removed[0] || null;
  }

  clear(): void {
    state.queues.clear(this.guildId);
  }

  size(): number {
    return state.queues.get(this.guildId).length;
  }

  swap(indexA: number, indexB: number): boolean {
    const q = state.queues.get(this.guildId);
    if (indexA < 0 || indexA >= q.length || indexB < 0 || indexB >= q.length) return false;
    [q[indexA], q[indexB]] = [q[indexB], q[indexA]];
    state.queues.set(this.guildId, q);
    return true;
  }

  shuffle(): void {
    const q = state.queues.get(this.guildId);
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [q[i], q[j]] = [q[j], q[i]];
    }
    state.queues.set(this.guildId, q);
  }

  move(fromIndex: number, toIndex: number): boolean {
    const q = state.queues.get(this.guildId);
    if (fromIndex < 0 || fromIndex >= q.length || toIndex < 0 || toIndex >= q.length) return false;
    const [item] = q.splice(fromIndex, 1);
    q.splice(toIndex, 0, item);
    state.queues.set(this.guildId, q);
    return true;
  }

  removeRange(from: number, to: number): number {
    const q = state.queues.get(this.guildId);
    if (from < 0 || from >= q.length || to < from || to >= q.length) return 0;
    const removed = q.splice(from, to - from + 1).length;
    state.queues.set(this.guildId, q);
    return removed;
  }
}

export default QueueEngine;
