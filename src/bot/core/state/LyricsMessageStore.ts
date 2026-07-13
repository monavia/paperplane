class LyricsMessageStore {
  private data = new Map<string, { channelId: string; messageId: string }>();

  set(guildId: string, channelId: string, messageId: string): void {
    this.data.set(guildId, { channelId, messageId });
  }

  get(guildId: string): { channelId: string; messageId: string } | undefined {
    return this.data.get(guildId);
  }

  delete(guildId: string): void {
    this.data.delete(guildId);
  }
}

const lyricsMessages = new LyricsMessageStore();
export = lyricsMessages;
