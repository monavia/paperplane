class PositionStore {
  private data = new Map<string, number>();

  get(guildId: string): number {
    return this.data.get(guildId) || 0;
  }

  set(guildId: string, position: number): void {
    this.data.set(guildId, position);
  }

  delete(guildId: string): void {
    this.data.delete(guildId);
  }

  has(guildId: string): boolean {
    return this.data.has(guildId);
  }

  entries(): IterableIterator<[string, number]> {
    return this.data.entries();
  }
}

export default PositionStore;
