// Track preference scoring for ytsearch results.
// Priority: lyrics > mv > official > anything else (except known junk).
// No hard reject — just sorting, so we never return "no results" due to filter.

const BAD_KEYWORDS = [
  "remix", "cover", "live", "karaoke", "nightcore", "slowed", "sped up",
  "reverb", "bass boosted", "8d", "viral", "tiktok", "joget", "dj",
];

const GOOD_KEYWORDS = [
  "lyrics", "lyric", "official", "mv", "music video",
];

function scoreTrack(track: any): number {
  const title = (track.info?.title || "").toLowerCase();
  const author = (track.info?.author || "").toLowerCase();
  let score = 0;

  // Bad keywords reduce score significantly
  for (const kw of BAD_KEYWORDS) {
    if (title.includes(kw)) score -= 3;
  }

  // Good keywords boost score
  for (const kw of GOOD_KEYWORDS) {
    if (title.includes(kw)) score += 2;
  }

  // Lyrics is highest priority
  if (title.includes("lyrics") || title.includes("lyric")) score += 4;

  // Official content
  if (title.includes("official") || author.includes("vevo")) score += 2;

  // Prefer reasonable duration (2-7 min)
  const dur = track.info?.duration || 0;
  if (dur > 120000 && dur < 420000) score += 1;

  return score;
}

export function pickBestTrack(tracks: any[]): any {
  if (!tracks?.length) return null;
  if (tracks.length === 1) return tracks[0];

  const scored = tracks.map((t) => ({ track: t, score: scoreTrack(t) }));
  scored.sort((a, b) => b.score - a.score);

  return scored[0].track;
}

export async function searchWithRetry(player: any, query: any, user: any, _retries = 2): Promise<any> {
  try {
    return await player.search(query, user);
  } catch (err: any) {
    if (_retries > 0) return searchWithRetry(player, query, user, _retries - 1);
    throw err;
  }
}
