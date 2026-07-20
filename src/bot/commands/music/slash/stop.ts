import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import * as MusicService from "@/bot/music/services/MusicService";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import Colors from "@/bot/core/constants/Colors";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";
import state from "@/bot/core/state/StateManager";

export default {
  data: new SlashCommandBuilder().setName("stop").setDescription("Stop playback"),
  async execute(interaction: any) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], flags: 64 });
    const engine = MusicService.getEngine(interaction.guildId!);
    const player = engine.player;
    if (!player) {
      return interaction.reply({ embeds: [ErrorEmbed.build("Nothing to stop.")], flags: 64 });
    }
    await interaction.deferReply();
    try {
      await MusicService.stop(interaction.guildId!, interaction.user.id, interaction.member?.displayName || interaction.user.username);
      await interaction.editReply({ embeds: [new EmbedBuilder().setDescription("Playback stopped.").setColor(Colors.INFO)] });
    } catch (err: any) {
      await interaction.editReply({ embeds: [ErrorEmbed.build(err.message)] });
    }
  },
};
