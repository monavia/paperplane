import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import * as MusicService from "@/bot/music/services/MusicService";
import * as NowPlayingEmbed from "@/bot/ui/embeds/NowPlayingEmbed";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import Colors from "@/bot/core/constants/Colors";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";
import state from "@/bot/core/state/StateManager";

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
