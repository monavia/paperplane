import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import * as MusicService from "../../services/MusicService";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import Colors from "../../../core/constants/Colors";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";

export default {
  data: new SlashCommandBuilder().setName("stop").setDescription("Stop playback"),
  async execute(interaction: any) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });
    const player = MusicService.getEngine(interaction.guildId!).player;
    if (!player) return interaction.reply({ embeds: [ErrorEmbed.build("No track is currently playing.")], ephemeral: true });
    await interaction.deferReply();
    try {
      await MusicService.stop(interaction.guildId!, interaction.user.id, interaction.user.username);
      await interaction.editReply({ embeds: [new EmbedBuilder().setDescription("Playback stopped.").setColor(Colors.INFO)] });
    } catch (err: any) {
      await interaction.editReply({ embeds: [ErrorEmbed.build(err.message)] });
    }
  },
};
