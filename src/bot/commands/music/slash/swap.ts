import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import Colors from "../../../../bot/core/constants/Colors.js";

export default {
  data: new SlashCommandBuilder()
    .setName("swap")
    .setDescription("Swap two tracks in the queue")
    .addIntegerOption((opt: any) => opt.setName("a").setDescription("First track index").setRequired(true))
    .addIntegerOption((opt: any) => opt.setName("b").setDescription("Second track index").setRequired(true)),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    if (!await requireSameVoice(interaction)) return;

    const a = interaction.options.getInteger("a", true);
    const b = interaction.options.getInteger("b", true);

    const guildId = interaction.guildId!;

    const queue = MusicService.getQueue(guildId);
    if (a < 0 || a >= queue.length || b < 0 || b >= queue.length) {
      return interaction.reply({ embeds: [ErrorEmbed.build(`Invalid index. Valid range: 0-${queue.length - 1}`)], flags: 64 });
    }
    if (a === 0 || b === 0) return interaction.reply({ embeds: [ErrorEmbed.build("Cannot swap the currently playing track.")], flags: 64 });

    const success = MusicService.swapTracks(guildId, a, b);
    if (!success) return interaction.reply({ embeds: [ErrorEmbed.build("Failed to swap tracks.")], flags: 64 });

    const trackA = queue[a];
    const trackB = queue[b];
    const embed = new EmbedBuilder()
      .setDescription(`Swapped **${trackA?.info?.title || "?"}** ↔ **${trackB?.info?.title || "?"}**`)
      .setColor(Colors.SUCCESS);

    await interaction.deferReply();
    await interaction.editReply({ embeds: [embed] });
  },
};
