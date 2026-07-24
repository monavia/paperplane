import { SlashCommandBuilder } from "discord.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import * as SuccessEmbed from "../../../../bot/ui/embeds/SuccessEmbed.js";

export default {
  data: new SlashCommandBuilder()
    .setName("move")
    .setDescription("Move a track to another position in the queue")
    .addIntegerOption((o) => o.setName("from").setDescription("Current position").setRequired(true))
    .addIntegerOption((o) => o.setName("to").setDescription("New position").setRequired(true)),

  async execute(interaction: any) {
    if (!await requireSameVoice(interaction)) return;

    const from = interaction.options.getInteger("from", true);
    const to = interaction.options.getInteger("to", true);
    const guildId = interaction.guildId!;

    const queue = MusicService.getQueue(guildId);

    if (from < 0 || from >= queue.length || to < 0 || to >= queue.length) {
      return interaction.reply({ embeds: [ErrorEmbed.build(`Invalid index. Valid range: 0-${queue.length - 1}`)], flags: 64 });
    }
    if (from === 0 || to === 0) {
      return interaction.reply({ embeds: [ErrorEmbed.build("Cannot move the currently playing track.")], flags: 64 });
    }

    const success = MusicService.moveTrack(guildId, from, to);
    if (!success) return interaction.reply({ embeds: [ErrorEmbed.build("Failed to move track.")], flags: 64 });

    await interaction.deferReply();
    await interaction.editReply({ embeds: [SuccessEmbed.build(`Moved track from position ${from} to ${to}`)] });
  },
};
