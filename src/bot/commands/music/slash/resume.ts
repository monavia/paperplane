import { SlashCommandBuilder } from "discord.js";
import * as MusicService from "@/bot/music/services/MusicService";
import * as SuccessEmbed from "@/bot/ui/embeds/SuccessEmbed";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";

export default {
  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Resume playback"),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });

    const player = MusicService.getEngine(interaction.guildId!).player;
    if (!player) return interaction.reply({ embeds: [ErrorEmbed.build("No track is currently playing.")], ephemeral: true });

    const resumed = await MusicService.resume(interaction.guildId!, interaction.user.id, (interaction.member as any)?.displayName || interaction.user.username);
    if (!resumed) return interaction.reply({ embeds: [ErrorEmbed.build("Failed to resume playback.")], ephemeral: true });

    await interaction.reply({ embeds: [SuccessEmbed.build("Playback resumed.")] });
  },
};
