import botConfig from "../../../config/bot";
import * as MusicService from "../../services/MusicService";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";
import * as SuccessEmbed from "../../../ui/embeds/SuccessEmbed";

export default {
  name: "remove",
  async execute(message: import("discord.js").Message, args: string[]) {
    if (!message.member) return;
    const vc = checkSameVoice(message);
    if (!vc.ok) return (message.channel as any).send({ embeds: [ErrorEmbed.build(vc.message)] });

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

    const count = MusicService.removeByQuery(guildId, input);
    if (!count) return (message.channel as any).send({ embeds: [ErrorEmbed.build(`No tracks found matching "${input}".`)] });
    (message.channel as any).send({ embeds: [SuccessEmbed.build(`Removed ${count} track(s) matching "${input}".`)] });
  },
};
