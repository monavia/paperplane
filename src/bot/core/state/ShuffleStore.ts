class ShuffleStore {
  private _shuffle: Map<string, boolean> = new Map();

  get(guildId: string): boolean {
    return this._shuffle.get(guildId) || false;
  }

  set(guildId: string, value: boolean): void {
    this._shuffle.set(guildId, value);
  }

  toggle(guildId: string): boolean {
    const current = this.get(guildId);
    this.set(guildId, !current);
    return !current;
  }

  delete(guildId: string): void {
    this._shuffle.delete(guildId);
  }
}

export default ShuffleStore;
