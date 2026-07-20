import { EmbedBuilder } from "discord.js";
import Colors from "../../core/constants/Colors";
import Emojis from "../../core/constants/Emojis";
import { cleanTitle } from "../../music/services/TitleResolver";

export function getSourceEmoji(source: string, spotifyUrl?: string | null): string {
  if (source === "spotify" || spotifyUrl) return Emojis.SPOTIFY;
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
  const cleaned = cleanTitle(track.info?.title || "", track.info?.author || "");
  const title = cleaned.title || track.info?.title || "Unknown";
  const author = cleaned.author || track.info?.author || "";
  const url = toHttpUrl(track.info?.spotifyUrl || track.info?.originalUrl || track.info?.uri || "");
  const source = track.info?.source || "youtube";
  const emoji = getSourceEmoji(source, track.info?.spotifyUrl);
  const display = author ? `${author} - ${title}` : title;
  return new EmbedBuilder()
    .setDescription(`${emoji} Started playing [${display}](${url})`)
    .setColor(Colors.NOWPLAYING);
}

export function addedToQueue(track: any, position: number): EmbedBuilder {
  const cleaned = cleanTitle(track.info?.title || "", track.info?.author || "");
  const title = cleaned.title || track.info?.title || "Unknown";
  const url = toHttpUrl(track.info?.spotifyUrl || track.info?.originalUrl || track.info?.uri || "");
  const source = track.info?.source || "youtube";
  const emoji = getSourceEmoji(source, track.info?.spotifyUrl);
  return new EmbedBuilder()
    .setDescription(`${emoji} Added to Queue [${title}](${url})\nPosition in Queue : \`${position || 1}\``)
    .setColor(Colors.SUCCESS);
}
