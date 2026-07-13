import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import * as MusicService from "../../services/MusicService";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import Colors from "../../../core/constants/Colors";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";

const TIMEOUT = 15000;

export default {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clear all tracks from the queue"),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });

    const guildId = interaction.guildId!;
    if (!MusicService.getEngine(guildId)?.player) return interaction.reply({ embeds: [ErrorEmbed.build("Bot is not connected to a voice channel.")], ephemeral: true });

    const queue = MusicService.getQueue(guildId);
    if (queue.length <= 1) return interaction.reply({ embeds: [ErrorEmbed.build("Queue is empty.")], ephemeral: true });

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

    const response = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });
    const msg = response.resource?.message ?? await interaction.fetchReply();

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
