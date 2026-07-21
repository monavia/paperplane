import botConfig from "@/bot/config/bot";
import { EmbedBuilder } from "discord.js";
import * as MusicService from "@/bot/music/services/MusicService";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import { requireSameVoice } from "@/bot/core/utils/VoiceCheck";
import Colors from "@/bot/core/constants/Colors";

export default {
  name: "swap",
  async execute(message: import("discord.js").Message, args: string[]) {
    if (!message.member) return;
    if (!await requireSameVoice(message)) return;

    const a = parseInt(args[0], 10);
    const b = parseInt(args[1], 10);
    if (isNaN(a) || isNaN(b)) return (message.channel as any).send({ embeds: [ErrorEmbed.build(`Usage: ${botConfig.prefix}swap <index1> <index2>`)] });

    const guildId = message.guildId!;

    const queue = MusicService.getQueue(guildId);
    if (a < 0 || a >= queue.length || b < 0 || b >= queue.length) {
      return (message.channel as any).send({ embeds: [ErrorEmbed.build(`Invalid index. Valid range: 0-${queue.length - 1}`)] });
    }
    if (a === 0 || b === 0) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Cannot swap the currently playing track.")] });

    const success = MusicService.swapTracks(guildId, a, b);
    if (!success) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Failed to swap tracks.")] });

    const trackA = queue[a];
    const trackB = queue[b];
    const embed = new EmbedBuilder()
      .setDescription(`Swapped **${trackA?.info?.title || "?"}** ↔ **${trackB?.info?.title || "?"}**`)
      .setColor(Colors.SUCCESS);

    await (message.channel as any).send({ embeds: [embed] });
  },
};
