import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import * as MusicService from "../../services/MusicService";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import Colors from "../../../core/constants/Colors";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";
import state from "../../../core/state/StateManager";

export default {
  data: new SlashCommandBuilder().setName("stop").setDescription("Stop playback"),
  async execute(interaction: any) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });
    const engine = MusicService.getEngine(interaction.guildId!);
    const player = engine.player;
    if (!player || (!player.playing && !player.paused && !engine.queue.size())) {
      return interaction.reply({ embeds: [ErrorEmbed.build("Nothing to stop.")], ephemeral: true });
    }
    await interaction.deferReply();
    try {
      await MusicService.stop(interaction.guildId!, interaction.user.id, interaction.user.username);
      await interaction.editReply({ embeds: [new EmbedBuilder().setDescription("Playback stopped.").setColor(Colors.INFO)] });
    } catch (err: any) {
      await interaction.editReply({ embeds: [ErrorEmbed.build(err.message)] });
    }
  },
};
