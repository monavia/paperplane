import { parseDuration } from "./Duration.js";

function formatTrack(track: any, index: number) {
  const title = track.info?.title || "Unknown";
  const url = track.info?.originalUrl || track.info?.uri;
  const duration = parseDuration(track.info?.duration ?? 0);
  const author = track.info?.author || "Unknown";
  return `\`${String(index).padStart(2, " ")}\` ${url ? `[${title}](${url})` : title} — ${author} \`[${duration}]\``;
}

function formatTrackCompact(track: any) {
  const title = track.info?.title || "Unknown";
  const url = track.info?.originalUrl || track.info?.uri;
  const duration = parseDuration(track.info?.duration ?? 0);
  return `[${title}](${url}) \`[${duration}]\``;
}

function formatPlaylist(tracks: any[]) {
  return tracks.map((t, i) => formatTrack(t, i + 1)).join("\n");
}

function formatVolume(volume: number) {
  const bars = Math.round(volume / 10);
  return `${"█".repeat(bars)}${"░".repeat(10 - bars)} ${volume}%`;
}

export { formatTrack, formatTrackCompact, formatPlaylist, formatVolume };
