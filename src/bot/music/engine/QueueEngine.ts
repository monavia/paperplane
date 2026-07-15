import state from "../../core/state/StateManager";

/**
 * QueueEngine — thin wrapper over state.queues for a single guild.
 *
 * IMPORTANT: These methods do NOT acquire withQueueLock internally.
 * All callers MUST hold the lock before calling mutating methods
 * (add, addMultiple, next, remove, swap, shuffle, move, removeRange, clear)
 * to prevent races with advanceQueue / skip / trackError.
 */
class QueueEngine {
  guildId: string;

  constructor(guildId: string) {
    this.guildId = guildId;
  }

  add(track: any): void {
    const q = state.queues.get(this.guildId);
    q.push(track);
    state.queues.set(this.guildId, q);
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
