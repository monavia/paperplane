import botConfig from "../../../../bot/config/bot.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import * as SuccessEmbed from "../../../../bot/ui/embeds/SuccessEmbed.js";

export default {
  name: "remove",
  async execute(message: import("discord.js").Message, args: string[]) {
    if (!message.member) return;
    if (!await requireSameVoice(message)) return;

    const input = args.join(" ");
    if (!input) return (message.channel as any).send({ embeds: [ErrorEmbed.build(`Usage: ${botConfig.prefix}remove <query|index|range>`)] });

    const guildId = message.guildId!;

    const queue = MusicService.getQueue(guildId);

    const rangeMatch = input.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1], 10);
      const to = parseInt(rangeMatch[2], 10);
      if (from < 0 || from >= queue.length || to < 0 || to >= queue.length || from > to) {
        return (message.channel as any).send({ embeds: [ErrorEmbed.build(`Invalid range. Valid: 0-${queue.length - 1}`)] });
      }
      const count = MusicService.removeRange(guildId, from, to);
      return (message.channel as any).send({ embeds: [SuccessEmbed.build(`Removed ${count} track(s) from position ${from} to ${to}`)] });
    }

    const singleIdx = parseInt(args[0], 10);
    if (!isNaN(singleIdx)) {
      if (singleIdx < 0 || singleIdx >= queue.length) {
        return (message.channel as any).send({ embeds: [ErrorEmbed.build(`Invalid index. Valid range: 0-${queue.length - 1}`)] });
      }
      if (singleIdx === 0) {
        return (message.channel as any).send({ embeds: [ErrorEmbed.build("Cannot remove the currently playing track.")] });
      }
      const title = queue[singleIdx]?.info?.title || "?";
      const removed = MusicService.removeFromQueue(guildId, singleIdx);
      if (!removed) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Failed to remove track.")] });
      return (message.channel as any).send({ embeds: [SuccessEmbed.build(`Removed **${title}** from the queue.`)] });
    }

    const force = args.includes("--yes");
    const count = await MusicService.removeByQuery(guildId, input, force);
    if (count === 0) return (message.channel as any).send({ embeds: [ErrorEmbed.build(`No tracks found matching "${input}".`)] });

    if (count < 0) {
      const confirmId = `rm_cf_${guildId}`;
      const cancelId = `rm_cx_${guildId}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(confirmId).setLabel(`Yes, Remove ${-count} Tracks`).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(cancelId).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
      );
      const sent = await (message.channel as any).send({ embeds: [ErrorEmbed.build(`This will remove ${-count} track(s) matching "${input}". Proceed?`)], components: [row] });
      try {
        const btn = await sent.awaitMessageComponent({ filter: (i: any) => i.user.id === message.author.id, time: 30000 });
        await btn.deferUpdate();
        if (btn.customId === confirmId) {
          const removed = await MusicService.removeByQuery(guildId, input, true);
          await sent.edit({ embeds: [SuccessEmbed.build(`Removed ${removed} track(s) matching "${input}".`)], components: [] });
        } else {
          await sent.edit({ embeds: [ErrorEmbed.build("Cancelled. No tracks removed.")], components: [] });
        }
      } catch {
        await sent.edit({ components: [ActionRowBuilder.from(row).setComponents(row.components.map((b: any) => b.setDisabled(true)))] });
      }
      return;
    }

    (message.channel as any).send({ embeds: [SuccessEmbed.build(`Removed ${count} track(s) matching "${input}".`)] });
  },
};
