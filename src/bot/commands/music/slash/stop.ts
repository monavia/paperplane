import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import Colors from "../../../../bot/core/constants/Colors.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import state from "../../../../bot/core/state/StateManager.js";

export default {
  data: new SlashCommandBuilder().setName("stop").setDescription("Stop playback"),
  async execute(interaction: any) {
    if (!await requireSameVoice(interaction)) return;
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
