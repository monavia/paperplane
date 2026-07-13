import botConfig from "../../../config/bot";
import * as MusicService from "../../services/MusicService";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";
import * as SuccessEmbed from "../../../ui/embeds/SuccessEmbed";

export default {
  name: "jump",
  aliases: ["skipto"],
  async execute(message: import("discord.js").Message, args: string[]) {
    if (!message.member) return;
    const vc = checkSameVoice(message);
    if (!vc.ok) return (message.channel as any).send({ embeds: [ErrorEmbed.build(vc.message)] });

    const index = parseInt(args[0], 10);
    if (isNaN(index)) return (message.channel as any).send({ embeds: [ErrorEmbed.build(`Usage: ${botConfig.prefix}jump <index>`)] });

    const guildId = message.guildId!;
    const queue = MusicService.getQueue(guildId);

    if (index < 0 || index >= queue.length) {
      return (message.channel as any).send({ embeds: [ErrorEmbed.build(`Invalid index. Valid range: 0-${queue.length - 1}`)] });
    }
    if (index === 0) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Already playing that track.")] });

    const track = queue[index];
    const success = await MusicService.jumpTo(guildId, index);
    if (!success) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Failed to jump to track.")] });

    (message.channel as any).send({ embeds: [SuccessEmbed.build(`Jumped to **${track?.info?.title || "?"}**`)] });
  },
};
