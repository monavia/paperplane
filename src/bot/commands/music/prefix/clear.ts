import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import * as MusicService from "@/bot/music/services/MusicService";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import Colors from "@/bot/core/constants/Colors";
import { requireSameVoice } from "@/bot/core/utils/VoiceCheck";

const TIMEOUT = 15000;

export default {
  name: "clear",
  async execute(message: import("discord.js").Message, args: string[]) {
    if (!await requireSameVoice(message)) return;

    const guildId = message.guildId!;
    if (!MusicService.getEngine(guildId)?.player) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Bot is not connected to a voice channel.")] });

    const queue = MusicService.getQueue(guildId);
    if (queue.length <= 1) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Queue is empty.")] });

    const trackCount = queue.length - 1;
    const embed = new EmbedBuilder()
      .setDescription(`Clear **${trackCount}** track${trackCount > 1 ? "s" : ""} from queue?`)
      .setColor(Colors.INFO);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("clear_yes")
        .setLabel("Yes")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("clear_no")
        .setLabel("No")
        .setStyle(ButtonStyle.Danger),
    );

    const msg = await (message.channel as any).send({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === message.author.id,
      time: TIMEOUT,
      max: 1,
    });

    collector.on("collect", async (i: any) => {
      if (i.customId === "clear_yes") {
        MusicService.clearQueue(guildId);
        const result = new EmbedBuilder()
          .setDescription(`Cleared **${trackCount}** track${trackCount > 1 ? "s" : ""} from queue.`)
          .setColor(Colors.SUCCESS);
        await i.update({ embeds: [result], components: [] });
      } else {
        const result = new EmbedBuilder()
          .setDescription("Queue clear cancelled.")
          .setColor(Colors.INFO);
        await i.update({ embeds: [result], components: [] });
      }
    });

    collector.on("end", async (collected: any) => {
      if (collected.size === 0) {
        await msg.delete().catch(() => {});
      }
    });
  },
};
