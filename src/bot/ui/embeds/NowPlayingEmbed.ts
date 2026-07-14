import { EmbedBuilder } from "discord.js";
import Colors from "../../core/constants/Colors";
import Emojis from "../../core/constants/Emojis";

export function getSourceEmoji(source: string): string {
  if (source === "spotify") return Emojis.SPOTIFY;
  return Emojis.DEEZER;
}

function toHttpUrl(uri: string): string {
  if (!uri) return "";
  if (uri.startsWith("http")) return uri;
  const m = uri.match(/^spotify:(track|album|playlist):([a-zA-Z0-9]+)$/);
  if (m) return `https://open.spotify.com/${m[1]}/${m[2]}`;
  return uri;
}

export function build(track: any, _player: any): EmbedBuilder {
  const title = track.info?.title || "Unknown";
  const author = track.info?.author || "Unknown";
  const url = toHttpUrl(track.info?.spotifyUrl || track.info?.originalUrl || track.info?.uri || "");
  const source = track.info?.source || "youtube";
  const emoji = getSourceEmoji(source);
  const display = author !== "Unknown" ? `${author} - ${title}` : title;
  return new EmbedBuilder()
    .setDescription(`${emoji} Started playing [${display}](${url})`)
    .setColor(Colors.NOWPLAYING);
}

export function addedToQueue(track: any, position: number): EmbedBuilder {
  const title = track.info?.title || "Unknown";
  const url = toHttpUrl(track.info?.spotifyUrl || track.info?.originalUrl || track.info?.uri || "");
  const source = track.info?.source || "youtube";
  const emoji = getSourceEmoji(source);
  return new EmbedBuilder()
    .setDescription(`${emoji} Added to Queue [${title}](${url})\nPosition in Queue : \`${position || 1}\``)
    .setColor(Colors.SUCCESS);
}
