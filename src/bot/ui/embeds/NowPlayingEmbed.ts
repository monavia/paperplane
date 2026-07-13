import { EmbedBuilder } from "discord.js";
import Colors from "../../core/constants/Colors";
import Emojis from "../../core/constants/Emojis";

export function getSourceEmoji(source: string): string {
  if (source === "spotify") return Emojis.SPOTIFY;
  return Emojis.DEEZER;
}

export function build(track: any, _player: any): EmbedBuilder {
  const title = track.info?.title || "Unknown";
  const author = track.info?.author || "Unknown";
  const url = track.info?.spotifyUrl || track.info?.originalUrl || track.info?.uri || "";
  const source = track.info?.source || "youtube";
  const emoji = getSourceEmoji(source);
  return new EmbedBuilder()
    .setDescription(`${emoji} Started playing [${author} - ${title}](${url})`)
    .setColor(Colors.NOWPLAYING);
}

export function addedToQueue(track: any, position: number): EmbedBuilder {
  const title = track.info?.title || "Unknown";
  const url = track.info?.spotifyUrl || track.info?.originalUrl || track.info?.uri || "";
  const source = track.info?.source || "youtube";
  const emoji = getSourceEmoji(source);
  return new EmbedBuilder()
    .setDescription(`${emoji} Added to Queue [${title}](${url})\nPosition in Queue : \`${position || 1}\``)
    .setColor(Colors.SUCCESS);
}
