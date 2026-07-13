import * as MusicService from "../../services/MusicService";
import * as SuccessEmbed from "../../../ui/embeds/SuccessEmbed";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";

export default {
  name: "pause",
  async execute(message: import("discord.js").Message, args: string[]) {
    const vc = checkSameVoice(message);
    if (!vc.ok) return (message.channel as any).send({ embeds: [ErrorEmbed.build(vc.message)] });

    const player = MusicService.getEngine(message.guildId!).player;
    if (!player) return (message.channel as any).send({ embeds: [ErrorEmbed.build("No track is currently playing.")] });

    const paused = await MusicService.pause(message.guildId!, message.author.id, message.author.username);
    if (!paused) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Failed to pause playback.")] });

    await (message.channel as any).send({ embeds: [SuccessEmbed.build("Playback paused.")] });
  },
};
