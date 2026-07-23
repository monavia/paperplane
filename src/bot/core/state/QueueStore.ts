class QueueStore {
  private data = new Map<string, any[]>();
  private getPlayer: ((guildId: string) => any | null) | null = null;

  setPlayerGetter(fn: (guildId: string) => any | null): void {
    this.getPlayer = fn;
  }

  private playerQueue(guildId: string): any | null {
    if (!this.getPlayer) return null;
    const player = this.getPlayer(guildId);
    return player?.queue || null;
  }

  /** Sync RAM state to player.queue tracks (for persistence via queueStore) */
  syncToPlayer(guildId: string): void {
    if (!this.data.has(guildId)) return;
    const q = this.playerQueue(guildId);
    if (!q) return;
    const data = this.data.get(guildId)!;
    q.splice(0, q.tracks.length);
    if (data.length) q.splice(0, 0, data);
  }

  /** Sync player.queue tracks back to RAM (current track is in state.nowPlaying) */
  syncFromPlayer(guildId: string): void {
    const q = this.playerQueue(guildId);
    if (!q) return;
    const json = q.utils.toJSON();
    this.data.set(guildId, [...json.tracks]);
  }

  get(guildId: string): any[] {
    return [...(this.data.get(guildId) || [])];
  }

  set(guildId: string, queue: any[]): void {
    this.data.set(guildId, queue);
    this.syncToPlayer(guildId);
  }

  clear(guildId: string): void {
    this.data.delete(guildId);
    const q = this.playerQueue(guildId);
    if (q) {
      q.splice(0, q.tracks.length);
      q.current = null;
    }
  }

  has(guildId: string): boolean {
    return this.data.has(guildId);
  }
}

export default QueueStore;