import * as ErrorEmbed from "../../ui/embeds/ErrorEmbed.js";
import * as MusicService from "../../music/services/MusicService.js";

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
  if (!engine.player?.voiceChannelId) return { ok: false, message: "Bot is not connected to a voice channel." };
  if (voice.id !== engine.player.voiceChannelId) {
    return { ok: false, message: "You must be in the same voice channel as the bot." };
  }
  return { ok: true };
}

function replyError(source: any, message: string) {
  if (source.reply) return source.reply({ embeds: [ErrorEmbed.build(message)], flags: 64 });
  return (source.channel as any).send({ embeds: [ErrorEmbed.build(message)] });
}

export async function requireSameVoice(source: any): Promise<boolean> {
  const vc = checkSameVoice(source);
  if (!vc.ok) {
    await replyError(source, vc.message);
    return false;
  }
  return true;
}

export function withVoiceCheck(handler: (source: any) => Promise<any>) {
  return async (source: any) => {
    if (!await requireSameVoice(source)) return;
    return handler(source);
  };
}
