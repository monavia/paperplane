import * as MusicService from "../../services/MusicService";
import * as SuccessEmbed from "../../../ui/embeds/SuccessEmbed";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";

export default {
  name: "resume",
  async execute(message: import("discord.js").Message, args: string[]) {
    const vc = checkSameVoice(message);
    if (!vc.ok) return (message.channel as any).send({ embeds: [ErrorEmbed.build(vc.message)] });

    const player = MusicService.getEngine(message.guildId!).player;
    if (!player) return (message.channel as any).send({ embeds: [ErrorEmbed.build("No track is currently playing.")] });

    const resumed = await MusicService.resume(message.guildId!, message.author.id, message.member?.displayName || message.author.username);
    if (!resumed) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Failed to resume playback.")] });

    await (message.channel as any).send({ embeds: [SuccessEmbed.build("Playback resumed.")] });
  },
};
