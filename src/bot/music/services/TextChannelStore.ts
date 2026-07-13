const textChannels = new Map<string, string>();

export function getTextChannelId(guildId: string): string | null {
  return textChannels.get(guildId) || null;
}

export function setTextChannelId(guildId: string, channelId: string): void {
  textChannels.set(guildId, channelId);
}
