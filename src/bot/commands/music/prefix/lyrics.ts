import { EmbedBuilder } from "discord.js";
import { getPlayer } from "@/bot/music/engine/PlayerManager";
import * as ErrorEmbed from "@/bot/ui/embeds/ErrorEmbed";
import Colors from "@/bot/core/constants/Colors";
import Logger from "@/bot/core/utils/Logger";
import { fetchLyrics } from "@/bot/music/services/LyricsService";
import lyricsMessages from "@/bot/core/state/LyricsMessageStore";
import { checkSameVoice } from "@/bot/core/utils/VoiceCheck";

export default {
  name: "lyrics",
  aliases: ["ly"],
  async execute(message: import("discord.js").Message, args: string[]) {
    const vc = checkSameVoice(message);
    if (!vc.ok) return (message.channel as any).send({ embeds: [ErrorEmbed.build(vc.message)] });
    const player = getPlayer(message.guildId!);
    const track = player?.queue?.current;
    if (!track) return (message.channel as any).send({ embeds: [ErrorEmbed.build("Nothing is playing.")] });

    const msg = await (message.channel as any).send({ embeds: [new EmbedBuilder().setDescription("Fetching lyrics...").setColor(Colors.INFO)] });

    try {
      let text = "";
      let source = "";

      try {
        const lyrics = await player.getCurrentLyrics();
        if (lyrics?.lines?.length) {
          text = lyrics.text || lyrics.lines.map((l: any) => l.line).join("\n");
          source = lyrics.sourceName || lyrics.provider || "Lavalink";
        }
      } catch {}

      if (!text) {
        const lrclib = await fetchLyrics(track);
        if (lrclib) {
          text = lrclib.text;
          source = lrclib.source;
        }
      }

      if (!text) {
        return msg.edit({ embeds: [ErrorEmbed.build("No lyrics found for this track.")] });
      }

      const title = track.info.title || "Unknown";
      const author = track.info.author || "Unknown";

      const description = text.length > 4000 ? text.slice(0, 4000) + "\n*...*" : text;

      const embed = new EmbedBuilder()
        .setTitle(`${title} - ${author}`)
        .setDescription(description)
        .setFooter({ text: `Source: ${source}` })
        .setColor(Colors.NOWPLAYING);

      await msg.edit({ embeds: [embed] });
      lyricsMessages.set(message.guildId!, message.channel.id, msg.id);
    } catch (err: any) {
      Logger.error(`[LYRICS] Error: ${err.message}`);
      await msg.edit({ embeds: [ErrorEmbed.build("Failed to fetch lyrics.")] });
    }
  },
};
