class FilterStore {
  private _store: Map<string, string> = new Map();

  get(guildId: string): string {
    return this._store.get(guildId) || "none";
  }

  set(guildId: string, value: string): void {
    this._store.set(guildId, value);
  }

  delete(guildId: string): void {
    this._store.delete(guildId);
  }
}

export default FilterStore;
