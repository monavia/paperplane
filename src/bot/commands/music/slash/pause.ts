import { SlashCommandBuilder } from "discord.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import * as SuccessEmbed from "../../../../bot/ui/embeds/SuccessEmbed.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";

export default {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pause playback"),

  async execute(interaction: import("discord.js").ChatInputCommandInteraction) {
    if (!await requireSameVoice(interaction)) return;

    const player = MusicService.getEngine(interaction.guildId!).player;
    if (!player) return interaction.reply({ embeds: [ErrorEmbed.build("No track is currently playing.")], flags: 64 });

    const paused = await MusicService.pause(interaction.guildId!, interaction.user.id, (interaction.member as any)?.displayName || interaction.user.username);
    if (!paused) return interaction.reply({ embeds: [ErrorEmbed.build("Failed to pause playback.")], flags: 64 });

    await interaction.deferReply();
    await interaction.editReply({ embeds: [SuccessEmbed.build("Playback paused.")] });
  },
};
