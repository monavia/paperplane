import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import Colors from "../../../../bot/core/constants/Colors.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";

const TIMEOUT = 15000;

export default {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clear all tracks from the queue"),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    if (!await requireSameVoice(interaction)) return;

    const guildId = interaction.guildId!;
    if (!MusicService.getEngine(guildId)?.player) return interaction.reply({ embeds: [ErrorEmbed.build("Bot is not connected to a voice channel.")], flags: 64 });

    const queue = MusicService.getQueue(guildId);
    if (queue.length <= 1) return interaction.reply({ embeds: [ErrorEmbed.build("Queue is empty.")], flags: 64 });

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

    await interaction.deferReply();
    const msg = await interaction.editReply({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({
      filter: (i: any) => i.user.id === interaction.user.id,
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
