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
  /\(lirik\s*(lagu|musik)?\s*\)/gi,
  /\(remaster(?:ed)?\s*(?:audio|version|edition|version)?\s*\d{0,4}\)/gi,
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
  cleaned = cleaned.replace(/\s*[-–—]\s*Topic\s*[-–—]\s*/gi, " - ");
  return cleaned.replace(/\s{2,}/g, " ").trim();
}

const COVER_PATTERNS = [
  /\|\s*\w[\w\s]*\s*(cover|versi|version|tribute|tribut|imitation)\s*$/i,
  /\|\s*\w[\w\s]*$/i,
  /\bcover\s+(by|of|version|dari|oleh)\b/i,
  /\(cover\s+(by|of|version|dari|oleh|tribute)\)/i,
  /\((?:live\s+)?(cover|versi|version|tribute)\s*(?:by|of|dari|oleh)?\s*\w+\)/i,
  /^cover\s+(by|of|dari|oleh)\s/i,
  /\bversi\s+\w+\s+(cover|tribute)\b/i,
  /\([^)]*\blive\b[^)]*\bcover\b[^)]*\)/i,
  /\bcover\b/i,
  /\binstrumental\b/i,
];

export function isCover(title: string, author?: string): boolean {
  if (COVER_PATTERNS.some((re) => re.test(title))) return true;
  if (author && /^via\s+@/i.test(author)) return true;
  return false;
}

function parseInner(raw: string): { title: string; artist: string } | null {
  const inner = raw.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (!inner) return null;
  const l = inner[1].trim(), r = inner[2].trim();
  if (l.length < 2 || r.length < 1) return null;
  if (l.length < r.length) return { title: r, artist: l };
  return { title: l, artist: r };
}

export function cleanTitle(title: string, author?: string): { title: string; author: string } {
  let decoded = decodeHtmlEntities(title);
  let cleaned = stripNoise(decoded);

  const dashMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    let detectedAuthor = dashMatch[1].trim();
    let detectedTitle = stripNoise(dashMatch[2].trim());
    const inner = parseInner(detectedTitle);
    if (inner && inner.title.length >= 2) {
      detectedTitle = inner.title;
      detectedAuthor = inner.artist;
    }
    if (detectedTitle.length >= 2 && detectedAuthor.length >= 1) {
      return { title: detectedTitle, author: detectedAuthor };
    }
  }

  const ytAuthor = (author || "").replace(/\s*[-–—]\s*Topic$/i, "").trim();
  if (ytAuthor && cleaned.toLowerCase().startsWith(ytAuthor.toLowerCase())) {
    const extracted = cleaned.slice(ytAuthor.length).replace(/^\s*[-–—]\s*/, "").trim();
    if (extracted.length >= 2) {
      return { title: extracted, author: ytAuthor };
    }
  }

  // If dash match found but author is a channel, try flipping: Title - Artist
  if (dashMatch && ytAuthor && /channel|records?|official|topic|vevo|entertainment|production/i.test(ytAuthor)) {
    const first = dashMatch[1].trim();
    const second = dashMatch[2].trim();
    const ytNorm = ytAuthor.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const firstNorm = first.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const secondNorm = second.replace(/[^a-z0-9]/gi, "").toLowerCase();
    // If channel name matches first part → keep original (Artist - Title)
    if (ytNorm.startsWith(firstNorm) || ytNorm.endsWith(firstNorm) || firstNorm.startsWith(ytNorm)) {
      const cleanedSecond = stripNoise(second);
      const inner = parseInner(cleanedSecond);
      if (inner) return { title: inner.title, author: inner.artist };
      return { title: cleanedSecond, author: first };
    }
    // If channel name matches second part → already Artist - Title, keep as-is
    if (ytNorm.startsWith(secondNorm) || ytNorm.endsWith(secondNorm) || secondNorm.startsWith(ytNorm)) {
      return { title: stripNoise(first), author: second };
    }
    // Channel matches neither → flip (Title - Artist format)
    if (second.length >= 2 && first.length >= 1) {
      return { title: stripNoise(first), author: second };
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
