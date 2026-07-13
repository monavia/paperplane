import * as MusicService from "../../music/services/MusicService";

type VoiceResult = { ok: true } | { ok: false; message: string };

function getGuildId(source: any): string {
  return source.guildId || source.guild?.id;
}

export function checkUserVoice(source: any): VoiceResult {
  const voice = source.member?.voice?.channel;
  if (!voice) return { ok: false, message: "You must be in a voice channel." };
  return { ok: true };
}

export function checkBotVoice(guildId: string): VoiceResult {
  const engine = MusicService.getEngine(guildId);
  if (!engine?.player) return { ok: false, message: "Bot is not connected to a voice channel." };
  return { ok: true };
}

export function checkSameVoice(source: any): VoiceResult {
  const voice = source.member?.voice?.channel;
  if (!voice) return { ok: false, message: "You must be in a voice channel." };
  const guildId = getGuildId(source);
  const engine = MusicService.getEngine(guildId);
  if (!engine?.player) return { ok: false, message: "Bot is not connected to a voice channel." };
  if (!engine.player.voiceChannelId) return { ok: false, message: "Bot is not connected to a voice channel." };
  if (voice.id !== engine.player.voiceChannelId) {
    return { ok: false, message: "You must be in the same voice channel as the bot." };
  }
  return { ok: true };
}
