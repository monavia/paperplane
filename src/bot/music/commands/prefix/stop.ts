import { EmbedBuilder } from "discord.js";
import * as MusicService from "../../services/MusicService";
import * as ErrorEmbed from "../../../ui/embeds/ErrorEmbed";
import Colors from "../../../core/constants/Colors";
import { checkSameVoice } from "../../../core/utils/VoiceCheck";

export default {
  name: "stop",
  async execute(message: any, _args: string[]) {
    const vc = checkSameVoice(message);
    if (!vc.ok) return message.channel.send({ embeds: [ErrorEmbed.build(vc.message)] });
    const player = MusicService.getEngine(message.guildId!).player;
    if (!player) return message.channel.send({ embeds: [ErrorEmbed.build("No track is currently playing.")] });
    try {
      await MusicService.stop(message.guildId!, message.author.id, message.author.username);
      return message.channel.send({ embeds: [new EmbedBuilder().setDescription("Playback stopped.").setColor(Colors.INFO)] });
    } catch (err: any) {
      await message.channel.send({ embeds: [ErrorEmbed.build(err.message)] });
    }
  },
};
