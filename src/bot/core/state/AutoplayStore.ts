class AutoplayStore {
  private _store: Map<string, boolean> = new Map();

  get(guildId: string): boolean {
    return this._store.get(guildId) || false;
  }

  set(guildId: string, value: boolean): void {
    this._store.set(guildId, value);
  }

  delete(guildId: string): void {
    this._store.delete(guildId);
  }
}

export default AutoplayStore;
