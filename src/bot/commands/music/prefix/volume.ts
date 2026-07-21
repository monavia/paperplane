import * as MusicService from "@/bot/music/services/MusicService";
import { formatVolume } from "@/bot/core/utils/Formatter";
import * as SuccessEmbed from "@/bot/ui/embeds/SuccessEmbed";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import { updateVolume } from "@/bot/database/repositories/GuildRepository";
import { requireSameVoice } from "@/bot/core/utils/VoiceCheck";

export default {
  name: "volume",
  async execute(message: import("discord.js").Message, args: string[]) {
    if (!await requireSameVoice(message)) return;

    const level = parseInt(args[0]);
    if (isNaN(level) || level < 1 || level > 100) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Volume must be 1-100.")] });

    MusicService.setVolume(message.guildId!, level, message.author.id, message.member?.displayName || message.author.username);
    updateVolume(message.guildId!, level);
    await (message.channel as any).send({ embeds: [SuccessEmbed.build(`Volume set to ${formatVolume(level)}`)] });
  },
};
