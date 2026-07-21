import * as EventBus from "../events/EventBus";

const playerStore = new Map<string, { voiceChannelId: string; textChannelId: string }>();

export function getPlayerData(guildId: string): { voiceChannelId: string; textChannelId: string } | null {
  return playerStore.get(guildId) || null;
}

export function setPlayerData(guildId: string, data: { voiceChannelId: string; textChannelId: string }): void {
  playerStore.set(guildId, data);
}

export function deletePlayerData(guildId: string): void {
  playerStore.delete(guildId);
}

EventBus.on('persistent:deletePlayerData', (p: any) => { if (p?.guildId) deletePlayerData(p.guildId); });
