import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getQueue } from "@/bot/music/services/QueueService";
import { build as buildQueueEmbed, buildQueuePayload } from "@/bot/ui/embeds/QueueEmbed";
import Colors from "@/bot/core/constants/Colors";

export default {
  data: new SlashCommandBuilder().setName("queue").setDescription("Show the music queue"),
  async execute(interaction: any) {
    const tracks = getQueue(interaction.guildId!);
    if (!tracks?.length) {
      const embed = new EmbedBuilder().setDescription("Queue is empty.").setColor(Colors.INFO);
      return interaction.reply({ embeds: [embed] });
    }
    const { embed, buttonRow, totalPages } = buildQueueEmbed(tracks, 1);
    const msg = await interaction.reply({ embeds: [embed], components: [buttonRow], fetchReply: true });

    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === interaction.user.id,
      time: 60000,
    });

    let page = 1;
    collector.on("collect", async (i: any) => {
      const map: Record<string, number> = { queue_first: 1, queue_prev: Math.max(1, page - 1), queue_next: Math.min(totalPages, page + 1), queue_last: totalPages };
      if (i.customId in map) { page = map[i.customId]; await i.update(buildQueuePayload(getQueue(interaction.guildId!), page)); }
    });
    collector.on("end", async () => {
      const { embed: e } = buildQueueEmbed(getQueue(interaction.guildId!), page);
      await msg.edit({ embeds: [e], components: [] }).catch(() => {});
    });
  },
};
