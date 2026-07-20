import { SlashCommandBuilder } from "discord.js";
import * as MusicService from "@/bot/music/services/MusicService";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";
import * as SuccessEmbed from "@/bot/ui/embeds/SuccessEmbed";

export default {
  data: new SlashCommandBuilder()
    .setName("move")
    .setDescription("Move a track to another position in the queue")
    .addIntegerOption((o) => o.setName("from").setDescription("Current position").setRequired(true))
    .addIntegerOption((o) => o.setName("to").setDescription("New position").setRequired(true)),

  async execute(interaction: any) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], flags: 64 });

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

    interaction.reply({ embeds: [SuccessEmbed.build(`Moved track from position ${from} to ${to}`)] });
  },
};
