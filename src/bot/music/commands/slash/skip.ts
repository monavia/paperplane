import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import * as MusicService from "../../services/MusicService";
import * as NowPlayingEmbed from "../../../ui/embeds/NowPlayingEmbed";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import Colors from "../../../core/constants/Colors";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";
import state from "../../../core/state/StateManager";

export default {
  data: new SlashCommandBuilder().setName("skip").setDescription("Skip the current track"),
  async execute(interaction: any) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });
    const player = MusicService.getEngine(interaction.guildId!).player;
    if (!player) return interaction.reply({ embeds: [ErrorEmbed.build("No track is currently playing.")], ephemeral: true });
    await interaction.deferReply();
    try {
      const nextTrack = await MusicService.skip(interaction.guildId!, interaction.user.id, interaction.member?.displayName || interaction.user.username);
      if (nextTrack) await interaction.editReply({ embeds: [NowPlayingEmbed.build(nextTrack, null)] });
      else if (state.autoplay.get(interaction.guildId)) await interaction.editReply({ embeds: [new EmbedBuilder().setDescription("Skipped. Finding next track...").setColor(Colors.INFO)] });
      else await interaction.editReply({ embeds: [new EmbedBuilder().setDescription("Queue empty.").setColor(Colors.INFO)] });
    } catch (err: any) {
      await interaction.editReply({ embeds: [ErrorEmbed.build(err.message)] });
    }
  },
};
