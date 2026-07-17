class VoiceChannelStore {
  private data = new Map<string, { voiceChannelId: string; textChannelId: string }>();

  set(guildId: string, voiceChannelId: string, textChannelId: string): void {
    this.data.set(guildId, { voiceChannelId, textChannelId });
  }

  get(guildId: string): { voiceChannelId: string; textChannelId: string } | undefined {
    return this.data.get(guildId);
  }

  delete(guildId: string): void {
    this.data.delete(guildId);
  }

  entries(): IterableIterator<[string, { voiceChannelId: string; textChannelId: string }]> {
    return this.data.entries();
  }
}

export = VoiceChannelStore;
