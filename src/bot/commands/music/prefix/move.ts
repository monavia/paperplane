import botConfig from "../../../../bot/config/bot.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import * as SuccessEmbed from "../../../../bot/ui/embeds/SuccessEmbed.js";

export default {
  name: "move",
  async execute(message: import("discord.js").Message, args: string[]) {
    if (!message.member) return;
    if (!await requireSameVoice(message)) return;

    const from = parseInt(args[0], 10);
    const to = parseInt(args[1], 10);
    if (isNaN(from) || isNaN(to)) return (message.channel as any).send({ embeds: [ErrorEmbed.build(`Usage: ${botConfig.prefix}move <from> <to>`)] });

    const guildId = message.guildId!;

    const queue = MusicService.getQueue(guildId);
    if (from < 0 || from >= queue.length || to < 0 || to >= queue.length) {
      return (message.channel as any).send({ embeds: [ErrorEmbed.build(`Invalid index. Valid range: 0-${queue.length - 1}`)] });
    }
    if (from === 0 || to === 0) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Cannot move the currently playing track.")] });

    const success = MusicService.moveTrack(guildId, from, to);
    if (!success) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Failed to move track.")] });

    (message.channel as any).send({ embeds: [SuccessEmbed.build(`Moved track from position ${from} to ${to}`)] });
  },
};
