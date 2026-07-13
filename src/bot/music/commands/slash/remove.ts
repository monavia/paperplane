import { SlashCommandBuilder } from "discord.js";
import * as MusicService from "../../services/MusicService";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";
import * as SuccessEmbed from "../../../ui/embeds/SuccessEmbed";

export default {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove tracks from the queue")
    .addStringOption((o) => o.setName("query").setDescription("Track name or position (e.g. 3 or 2-5)").setRequired(true)),

  async execute(interaction: any) {
    const vc = checkSameVoice(interaction);
    if (!vc.ok) return interaction.reply({ embeds: [ErrorEmbed.build(vc.message)], ephemeral: true });

    const input = interaction.options.getString("query", true);
    const guildId = interaction.guildId!;

    const queue = MusicService.getQueue(guildId);

    const rangeMatch = input.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1], 10);
      const to = parseInt(rangeMatch[2], 10);
      if (from < 0 || from >= queue.length || to < 0 || to >= queue.length || from > to) {
        return interaction.reply({ embeds: [ErrorEmbed.build(`Invalid range. Valid: 0-${queue.length - 1}`)], ephemeral: true });
      }
      const count = MusicService.removeRange(guildId, from, to);
      return interaction.reply({ embeds: [SuccessEmbed.build(`Removed ${count} track(s) from position ${from} to ${to}`)] });
    }

    const singleIdx = parseInt(input, 10);
    if (!isNaN(singleIdx)) {
      if (singleIdx < 0 || singleIdx >= queue.length) {
        return interaction.reply({ embeds: [ErrorEmbed.build(`Invalid index. Valid range: 0-${queue.length - 1}`)], ephemeral: true });
      }
      if (singleIdx === 0) {
        return interaction.reply({ embeds: [ErrorEmbed.build("Cannot remove the currently playing track.")], ephemeral: true });
      }
      const title = queue[singleIdx]?.info?.title || "?";
      const removed = MusicService.removeFromQueue(guildId, singleIdx);
      if (!removed) return interaction.reply({ embeds: [ErrorEmbed.build("Failed to remove track.")], ephemeral: true });
      return interaction.reply({ embeds: [SuccessEmbed.build(`Removed **${title}** from the queue.`)] });
    }

    const count = MusicService.removeByQuery(guildId, input);
    if (!count) return interaction.reply({ embeds: [ErrorEmbed.build(`No tracks found matching "${input}".`)] });
    interaction.reply({ embeds: [SuccessEmbed.build(`Removed ${count} track(s) matching "${input}".`)] });
  },
};
