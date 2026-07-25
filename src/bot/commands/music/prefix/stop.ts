import { EmbedBuilder } from "discord.js";
import * as MusicService from "../../../../bot/music/services/MusicService.js";
import * as ErrorEmbed from "../../../../bot/ui/embeds/ErrorEmbed.js";
import Colors from "../../../../bot/core/constants/Colors.js";
import { requireSameVoice } from "../../../../bot/core/utils/VoiceCheck.js";
import { markStopDisconnect } from "../../../music/engine/musicEvents.js";

export default {
  name: "stop",
  async execute(message: any, _args: string[]) {
    if (!await requireSameVoice(message)) return;
    const engine = MusicService.getEngine(message.guildId!);
    const player = engine.player;
    if (!player) {
      return message.channel.send({ embeds: [ErrorEmbed.build("Nothing to stop.")] });
    }
    try {
      markStopDisconnect(message.guildId!);
      await MusicService.stop(message.guildId!, message.author.id, message.member?.displayName || message.author.username);
      return message.channel.send({ embeds: [new EmbedBuilder().setDescription("Playback stopped.").setColor(Colors.INFO)] });
    } catch (err: any) {
      await message.channel.send({ embeds: [ErrorEmbed.build(err.message)] });
    }
  },
};
