class EqualizerStore {
  private _store: Map<string, any> = new Map();

  get(guildId: string): any {
    return this._store.get(guildId) ?? null;
  }

  set(guildId: string, value: any): void {
    this._store.set(guildId, value);
  }

  delete(guildId: string): void {
    this._store.delete(guildId);
  }
}

export default EqualizerStore;
