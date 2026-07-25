import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import * as SuccessEmbed from "../../../../bot/ui/embeds/SuccessEmbed.js";

export default {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove tracks from the queue")
    .addStringOption((o) => o.setName("query").setDescription("Track name or position (e.g. 3 or 2-5)").setRequired(true))
    .addBooleanOption((o) => o.setName("confirm").setDescription("Confirm removing >3 tracks at once").setRequired(false)),

  async execute(interaction: any) {
    if (!await requireSameVoice(interaction)) return;

    const input = interaction.options.getString("query", true);
    const force = interaction.options.getBoolean("confirm") === true;
    const guildId = interaction.guildId!;

    const queue = MusicService.getQueue(guildId);

    const rangeMatch = input.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1], 10);
      const to = parseInt(rangeMatch[2], 10);
      if (from < 0 || from >= queue.length || to < 0 || to >= queue.length || from > to) {
        return interaction.reply({ embeds: [ErrorEmbed.build(`Invalid range. Valid: 0-${queue.length - 1}`)], flags: 64 });
      }
      const count = MusicService.removeRange(guildId, from, to);
      await interaction.deferReply();
      return interaction.editReply({ embeds: [SuccessEmbed.build(`Removed ${count} track(s) from position ${from} to ${to}`)] });
    }

    const singleIdx = parseInt(input, 10);
    if (!isNaN(singleIdx)) {
      if (singleIdx < 0 || singleIdx >= queue.length) {
        return interaction.reply({ embeds: [ErrorEmbed.build(`Invalid index. Valid range: 0-${queue.length - 1}`)], flags: 64 });
      }
      if (singleIdx === 0) {
        return interaction.reply({ embeds: [ErrorEmbed.build("Cannot remove the currently playing track.")], flags: 64 });
      }
      const title = queue[singleIdx]?.info?.title || "?";
      const removed = MusicService.removeFromQueue(guildId, singleIdx);
      if (!removed) return interaction.reply({ embeds: [ErrorEmbed.build("Failed to remove track.")], flags: 64 });
      await interaction.deferReply();
      return interaction.editReply({ embeds: [SuccessEmbed.build(`Removed **${title}** from the queue.`)] });
    }

    const count = await MusicService.removeByQuery(guildId, input, force);
    if (count === 0) return interaction.reply({ embeds: [ErrorEmbed.build(`No tracks found matching "${input}".`)] });

    if (count < 0) {
      const confirmId = `rm_cf_${guildId}`;
      const cancelId = `rm_cx_${guildId}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(confirmId).setLabel(`Yes, Remove ${-count} Tracks`).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(cancelId).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
      );
      const reply = await interaction.reply({ embeds: [ErrorEmbed.build(`This will remove ${-count} track(s) matching "${input}". Proceed?`)], components: [row], fetchReply: true });
      try {
        const btn = await reply.awaitMessageComponent({ filter: (i: any) => i.user.id === interaction.user.id, time: 30000 });
        await btn.deferUpdate();
        if (btn.customId === confirmId) {
          const removed = await MusicService.removeByQuery(guildId, input, true);
          await interaction.editReply({ embeds: [SuccessEmbed.build(`Removed ${removed} track(s) matching "${input}".`)], components: [] });
        } else {
          await interaction.editReply({ embeds: [ErrorEmbed.build("Cancelled. No tracks removed.")], components: [] });
        }
      } catch {
        await interaction.editReply({ components: [ActionRowBuilder.from(row).setComponents(row.components.map((b: any) => b.setDisabled(true)))] });
      }
      return;
    }

    await interaction.deferReply();
    await interaction.editReply({ embeds: [SuccessEmbed.build(`Removed ${count} track(s) matching "${input}".`)] });
  },
};
