import { EmbedBuilder } from "discord.js";
import * as MusicService from "@/bot/music/services/MusicService";
import * as NowPlayingEmbed from "@/bot/ui/embeds/NowPlayingEmbed";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import Colors from "@/bot/core/constants/Colors";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";
import state from "@/bot/core/state/StateManager";

export default {
  name: "skip", aliases: ["s"],
  async execute(message: any, _args: string[]) {
    const vc = checkSameVoice(message);
    if (!vc.ok) return message.channel.send({ embeds: [ErrorEmbed.build(vc.message)] });
    const player = MusicService.getEngine(message.guildId!).player;
    if (!player) return message.channel.send({ embeds: [ErrorEmbed.build("No track is currently playing.")] });
    try {
      const nextTrack = await MusicService.skip(message.guildId!, message.author.id, message.member?.displayName || message.author.username);
      if (nextTrack) return message.channel.send({ embeds: [NowPlayingEmbed.build(nextTrack, null)] });
      if (state.autoplay.get(message.guildId)) return message.channel.send({ embeds: [new EmbedBuilder().setDescription("Skipped. Finding next track...").setColor(Colors.INFO)] });
      return message.channel.send({ embeds: [new EmbedBuilder().setDescription("Queue empty.").setColor(Colors.INFO)] });
    } catch (err: any) {
      await message.channel.send({ embeds: [ErrorEmbed.build(err.message)] });
    }
  },
};
