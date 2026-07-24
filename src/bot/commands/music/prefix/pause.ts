import * as MusicService from "../../../../bot/music/services/MusicService.js";
import * as SuccessEmbed from "../../../../bot/ui/embeds/SuccessEmbed.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";

export default {
  name: "pause",
  async execute(message: import("discord.js").Message, args: string[]) {
    if (!await requireSameVoice(message)) return;

    const player = MusicService.getEngine(message.guildId!).player;
    if (!player) return (message.channel as any).send({ embeds: [ErrorEmbed.build("No track is currently playing.")] });

    const paused = await MusicService.pause(message.guildId!, message.author.id, message.member?.displayName || message.author.username);
    if (!paused) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Failed to pause playback.")] });

    await (message.channel as any).send({ embeds: [SuccessEmbed.build("Playback paused.")] });
  },
};
