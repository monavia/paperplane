import * as MusicService from "../../services/MusicService";
import { formatVolume } from "../../../core/utils/Formatter";
import * as SuccessEmbed from "../../../ui/embeds/SuccessEmbed";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import { updateVolume } from "../../../database/repositories/GuildRepository";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";

export default {
  name: "volume",
  async execute(message: import("discord.js").Message, args: string[]) {
    const vc = checkSameVoice(message);
    if (!vc.ok) return (message.channel as any).send({ embeds: [ErrorEmbed.build(vc.message)] });

    const level = parseInt(args[0]);
    if (isNaN(level) || level < 1 || level > 100) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Volume must be 1-100.")] });

    MusicService.setVolume(message.guildId!, level, message.author.id, message.member?.displayName || message.author.username);
    updateVolume(message.guildId!, level);
    await (message.channel as any).send({ embeds: [SuccessEmbed.build(`Volume set to ${formatVolume(level)}`)] });
  },
};
