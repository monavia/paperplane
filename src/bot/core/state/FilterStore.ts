class FilterStore {
  private _store: Map<string, string[]> = new Map();

  /** Get active filter names */
  get(guildId: string): string[] {
    return this._store.get(guildId) || [];
  }

  /** Returns true if at least one filter is active (excluding "none") */
  isActive(guildId: string): boolean {
    const active = this._store.get(guildId);
    return !!active && active.length > 0;
  }

  /** Toggle a filter on/off. Returns the new state (on = true). */
  toggle(guildId: string, filter: string): boolean {
    const current = this._store.get(guildId) || [];
    const idx = current.indexOf(filter);
    if (idx >= 0) {
      current.splice(idx, 1);
      this._store.set(guildId, current);
      return false;
    }
    this._store.set(guildId, [...current, filter]);
    return true;
  }

  /** Set multiple filters at once (replaces all) */
  set(guildId: string, filters: string[]): void {
    this._store.set(guildId, [...new Set(filters.filter(f => f !== "none"))]);
  }

  /** Remove all filters for a guild */
  clear(guildId: string): void {
    this._store.set(guildId, []);
  }

  delete(guildId: string): void {
    this._store.delete(guildId);
  }
}

export default FilterStore;
