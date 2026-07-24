import * as MusicService from "../../../../bot/music/services/MusicService.js";
import * as SuccessEmbed from "../../../../bot/ui/embeds/SuccessEmbed.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";

export default {
  name: "resume",
  async execute(message: import("discord.js").Message, args: string[]) {
    if (!await requireSameVoice(message)) return;

    const player = MusicService.getEngine(message.guildId!).player;
    if (!player) return (message.channel as any).send({ embeds: [ErrorEmbed.build("No track is currently playing.")] });

    const resumed = await MusicService.resume(message.guildId!, message.author.id, message.member?.displayName || message.author.username);
    if (!resumed) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Failed to resume playback.")] });

    await (message.channel as any).send({ embeds: [SuccessEmbed.build("Playback resumed.")] });
  },
};
