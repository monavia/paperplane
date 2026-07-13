class QueueStore {
  private data = new Map<string, any[]>();

  get(guildId: string): any[] {
    return this.data.get(guildId) || [];
  }

  set(guildId: string, queue: any[]): void {
    this.data.set(guildId, queue);
  }

  clear(guildId: string): void {
    this.data.delete(guildId);
  }

  has(guildId: string): boolean {
    return this.data.has(guildId);
  }
}

export = QueueStore;
