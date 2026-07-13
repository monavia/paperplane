class TwentyFourSevenStore {
  private data = new Map<string, { enabled: boolean; channelId?: string }>();

  isEnabled(guildId: string): boolean {
    return this.data.get(guildId)?.enabled || false;
  }

  getChannelId(guildId: string): string | undefined {
    return this.data.get(guildId)?.channelId;
  }

  set(guildId: string, enabled: boolean, channelId?: string): void {
    this.data.set(guildId, { enabled, channelId });
  }

  delete(guildId: string): void {
    this.data.delete(guildId);
  }
}

export = TwentyFourSevenStore;
