const NOISE_PATTERNS = [
  /\(official\s*(music\s*)?video\)/gi,
  /\(official\s*audio\)/gi,
  /\(official\s*lyric\s*video\)/gi,
  /\[official\s*(music\s*)?video\]/gi,
  /\[official\s*audio\]/gi,
  /\[official\s*lyric\s*video\]/gi,
  /\(lyrics?\)/gi,
  /\[lyrics?\]/gi,
  /\(lyric\s*video\)/gi,
  /\[lyric\s*video\]/gi,
  /\(mv\)/gi,
  /\[mv\]/gi,
  /\(audio\)/gi,
  /\[audio\]/gi,
  /\(video\)/gi,
  /\(official\)/gi,
  /\[official\]/gi,
  /\(HD\)/gi,
  /\[HD\]/gi,
  /\(4K\)/gi,
  /\[4K\]/gi,
  /-\s*topic$/gi,
  /\(visualizer\)/gi,
  /\[visualizer\]/gi,
  /\(clip\s*officiel\)/gi,
  /\(live\)/gi,
  /\[live\]/gi,
  /\(concert\)/gi,
  /\(acoustic\)/gi,
  /\[acoustic\]/gi,
];

const TRAILING_NOISE = [
  /\|\s*\w+\s*(music|official|channel|records?|entertainment)\s*$/gi,
  /\b GAS POL\b/gi,
  /\b NDANGAK\b/gi,
  /\b TERBARU\b/gi,
  /\b\s*\d{4}\s*$/g,
  /\b\s*FULL\s*(ALBUM|VERSION)?\s*$/gi,
  /\b\s*PROD\.?\s*BY\s*\w+\s*$/gi,
  /\b\s*#shorts?\b/gi,
  /\s*-\s*$/,
];

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripNoise(title: string): string {
  let cleaned = title;
  for (const re of NOISE_PATTERNS) {
    cleaned = cleaned.replace(re, "");
  }
  for (const re of TRAILING_NOISE) {
    cleaned = cleaned.replace(re, "");
  }
  return cleaned.replace(/\s{2,}/g, " ").trim();
}

export function cleanTitle(title: string, author?: string): { title: string; author: string } {
  let decoded = decodeHtmlEntities(title);
  let cleaned = stripNoise(decoded);

  const dashMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    const detectedAuthor = dashMatch[1].trim();
    const detectedTitle = dashMatch[2].trim();
    if (detectedTitle.length >= 2 && detectedAuthor.length >= 1) {
      return {
        title: detectedTitle,
        author: detectedAuthor,
      };
    }
  }

  const ytAuthor = (author || "").replace(/\s*-\s*Topic$/i, "").trim();
  if (ytAuthor && cleaned.toLowerCase().startsWith(ytAuthor.toLowerCase())) {
    const extracted = cleaned.slice(ytAuthor.length).replace(/^\s*[-–—]\s*/, "").trim();
    if (extracted.length >= 2) {
      return { title: extracted, author: ytAuthor };
    }
  }

  return { title: cleaned, author: ytAuthor || author || "Unknown" };
}

export function saveSpotifyMeta(track: any): { title: string; author: string; spotifyUrl: string | null } | null {
  if (!track?.info?.spotifyUrl) return null;
  return {
    title: track.info.title || "",
    author: track.info.author || "",
    spotifyUrl: track.info.spotifyUrl,
  };
}

export function applySpotifyMeta(track: any, saved: { title: string; author: string; spotifyUrl: string | null } | null): void {
  if (!saved || !track) return;
  track.info.title = saved.title;
  track.info.author = saved.author;
  track.info.spotifyUrl = saved.spotifyUrl;
}
