import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import * as MusicService from "@/bot/music/services/MusicService";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";
import Colors from "@/bot/core/constants/Colors";

export default {
  data: new SlashCommandBuilder()
    .setName("swap")
    .setDescription("Swap two tracks in the queue")
    .addIntegerOption((opt: any) => opt.setName("a").setDescription("First track index").setRequired(true))
    .addIntegerOption((opt: any) => opt.setName("b").setDescription("Second track index").setRequired(true)),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });

    const a = interaction.options.getInteger("a", true);
    const b = interaction.options.getInteger("b", true);

    const guildId = interaction.guildId!;

    const queue = MusicService.getQueue(guildId);
    if (a < 0 || a >= queue.length || b < 0 || b >= queue.length) {
      return interaction.reply({ embeds: [ErrorEmbed.build(`Invalid index. Valid range: 0-${queue.length - 1}`)], ephemeral: true });
    }
    if (a === 0 || b === 0) return interaction.reply({ embeds: [ErrorEmbed.build("Cannot swap the currently playing track.")], ephemeral: true });

    const success = MusicService.swapTracks(guildId, a, b);
    if (!success) return interaction.reply({ embeds: [ErrorEmbed.build("Failed to swap tracks.")], ephemeral: true });

    const trackA = queue[a];
    const trackB = queue[b];
    const embed = new EmbedBuilder()
      .setDescription(`Swapped **${trackA?.info?.title || "?"}** ↔ **${trackB?.info?.title || "?"}**`)
      .setColor(Colors.SUCCESS);

    await interaction.reply({ embeds: [embed] });
  },
};
