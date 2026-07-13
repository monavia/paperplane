import { get } from "./lavalink";

const players = new Map<string, any>();
const voiceJoinTimes = new Map<string, number>();

export function getPlayer(guildId: string): any {
  const mgr = get();
  return mgr?.players?.get(guildId) || null;
}

export function createPlayer(guildId: string, voiceChannelId: string | null, textChannelId: string | null): any {
  const mgr = get();
  if (!mgr) return null;
  const existing = mgr.players.get(guildId);
  if (existing) return existing;
  const player = mgr.createPlayer({
    guildId,
    voiceChannelId: voiceChannelId || "",
    textChannelId: textChannelId || "",
    selfDeaf: true,
    selfMute: false,
  });
  players.set(guildId, true);
  return player;
}

export function destroyPlayer(guildId: string): Promise<any> {
  players.delete(guildId);
  const mgr = get();
  const player = mgr?.players?.get(guildId);
  if (player) return player.destroy();
  return Promise.resolve();
}

export function setVoiceJoinTime(guildId: string): void {
  voiceJoinTimes.set(guildId, Date.now());
}

export function clearVoiceJoinTime(guildId: string): void {
  voiceJoinTimes.delete(guildId);
}

export function getVoiceJoinDuration(guildId: string): number {
  const t = voiceJoinTimes.get(guildId);
  return t ? Date.now() - t : 0;
}
