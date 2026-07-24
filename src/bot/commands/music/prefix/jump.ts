import botConfig from "../../../../bot/config/bot.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import * as SuccessEmbed from "../../../../bot/ui/embeds/SuccessEmbed.js";

export default {
  name: "jump",
  aliases: ["skipto"],
  async execute(message: import("discord.js").Message, args: string[]) {
    if (!message.member) return;
    if (!await requireSameVoice(message)) return;

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
