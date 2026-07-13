import Logger from "../../core/utils/Logger";

const LRCLIB_URL = "https://lrclib.net/api";

function extractSongTitle(title: string): string {
  let t = title
    .replace(/\s*[\[\(].*?[\]\)]\s*/g, "")
    .replace(/\s*(official|music|video|audio|lyric|lyrics|lirik|liric|hd|4k|nightcore|remix|cover|version|ver\.?|mv)\s*/gi, "")
    .trim();

  const parts = t.split(/\s*[-–—]\s*/);
  if (parts.length >= 2) {
    const looksLikeArtist = /^[\w\s.,&' x]+$/.test(parts[parts.length - 1]) && parts[parts.length - 1].length < 40;
    const hasArtistHint = /\b(feat|ft|vs|x|and|&)\b/i.test(parts[parts.length - 1]);
    if (looksLikeArtist || hasArtistHint) {
      t = parts.slice(0, -1).join(" - ");
    }
  }

  return t.trim();
}

function extractArtist(author: string): string {
  return author
    .replace(/\s*(official|topic|music|records?|entertainment|vevo|ukw|and\s+\d+\s+more)\s*/gi, "")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

interface SyncedLine {
  time: number;
  text: string;
}

function parseSyncedLyrics(lrc: string): SyncedLine[] {
  const lines: SyncedLine[] = [];
  for (const raw of lrc.split("\n")) {
    const match = raw.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      let ms = parseInt(match[3], 10);
      if (match[3].length === 2) ms *= 10;
      const time = min * 60 + sec + ms / 1000;
      const text = match[4].trim();
      if (text) lines.push({ time, text });
    }
  }
  return lines;
}

async function fetchLyrics(track: any): Promise<{ text: string; source: string; synced?: SyncedLine[] } | null> {
  const rawTitle = track?.info?.title || "";
  const rawAuthor = track?.info?.author || "";
  const duration = Math.round((track?.info?.duration || 0) / 1000);

  const songTitle = extractSongTitle(rawTitle);
  const artist = extractArtist(rawAuthor);

  try {
    const params = new URLSearchParams({
      track_name: songTitle,
      artist_name: artist,
      duration: String(duration),
    });

    const res = await fetch(`${LRCLIB_URL}/get?${params}`, {
      headers: { "User-Agent": "PaperplaneBot/2.0.0 (https://github.com/monavia)" },
    });

    if (res.ok) {
      const data: any = await res.json();
      if (data.plainLyrics) {
        const synced = data.syncedLyrics ? parseSyncedLyrics(data.syncedLyrics) : undefined;
        return { text: data.plainLyrics, source: "LRCLIB", synced: synced?.length ? synced : undefined };
      }
    }

    const searchRes = await fetch(`${LRCLIB_URL}/search?q=${encodeURIComponent(songTitle + " " + artist)}`, {
      headers: { "User-Agent": "PaperplaneBot/2.0.0 (https://github.com/monavia)" },
    });

    if (searchRes.ok) {
      const results: any = await searchRes.json();
      if (Array.isArray(results) && results.length > 0) {
        const best = results.find((r: any) => r.plainLyrics) || results[0];
        if (best.plainLyrics) {
          const synced = best.syncedLyrics ? parseSyncedLyrics(best.syncedLyrics) : undefined;
          return { text: best.plainLyrics, source: "LRCLIB", synced: synced?.length ? synced : undefined };
        }
      }
    }
  } catch (err: any) {
    Logger.error(`[LYRICS] LRCLIB error: ${err.message}`);
  }

  try {
    const ovhUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(songTitle)}`;
    const ovhRes = await fetch(ovhUrl);
    if (ovhRes.ok) {
      const ovhData: any = await ovhRes.json();
      if (ovhData.lyrics) {
        return { text: ovhData.lyrics, source: "Lyrics.ovh" };
      }
    }
  } catch (err: any) {
    Logger.error(`[LYRICS] Lyrics.ovh error: ${err.message}`);
  }

  return null;
}

export { fetchLyrics, SyncedLine };
