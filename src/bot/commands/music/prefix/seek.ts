import botConfig from "@/bot/config/bot";
import * as MusicService from "@/bot/music/services/MusicService";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import * as SuccessEmbed from "@/bot/ui/embeds/SuccessEmbed";
import { requireSameVoice } from "@/bot/core/utils/VoiceCheck";

function parseTime(input: string): number | null {
  const match = input.match(/^(?:(\d+):)?(\d+)$/);
  if (!match) return null;
  const mins = parseInt(match[1] || "0", 10);
  const secs = parseInt(match[2], 10);
  if (secs >= 60) return null;
  return (mins * 60 + secs) * 1000;
}

export default {
  name: "seek",
  async execute(message: import("discord.js").Message, args: string[]) {
    if (!await requireSameVoice(message)) return;

    const player = MusicService.getEngine(message.guildId!).player;
    if (!player?.playing) return (message.channel as any).send({ embeds: [ErrorEmbed.build("No track is currently playing.")] });

    if (!args.length) return (message.channel as any).send({ embeds: [ErrorEmbed.build(`Usage: \`${botConfig.prefix}seek <position>\` — e.g. \`${botConfig.prefix}seek 1:30\` or \`${botConfig.prefix}seek 90\``)] });

    const ms = parseTime(args[0]);
    if (ms === null) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Invalid position. Use format: `1:30` or `90`.")] });

    const duration = player.queue.current?.info?.duration || 0;
    if (ms > duration) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Position exceeds track duration.")] });

    player.seek(ms);
    const display = args[0].match(/^(\d+:)?\d+$/) ? args[0] : `${Math.floor(ms / 60000)}:${Math.floor((ms % 60000) / 1000).toString().padStart(2, "0")}`;
    await (message.channel as any).send({ embeds: [SuccessEmbed.build(`Seeked to \`${display}\``)] });
  },
};
