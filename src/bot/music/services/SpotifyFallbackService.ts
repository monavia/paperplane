import Logger from "../../core/utils/Logger.js";
import { withQueueLock } from "../../core/state/QueueLock.js";
import * as SpotifyScraper from "../engine/SpotifyScraper.js";
import SpotifyResolver from "../engine/SpotifyResolver.js";
import { searchWithRetry } from "./SearchService.js";
import { getAdapter } from "../../cache/CacheAdapter.js";
import ActivityService from "../../services/ActivityService.js";
import botConfig from "../../config/bot.js";
import { applySpotifyMeta } from "./TitleResolver.js";

const FALLBACK_PREFIX = "fallback:spotify:";
const FALLBACK_TTL = 86_400_000;

function extractSpotifyTrackId(uri: string): string | null {
  const m = uri.match(/spotify:track:([a-zA-Z0-9]+)/);
  if (m) return m[1];
  const u = uri.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (u) return u[1];
  return null;
}

async function getFallbackCache(uri: string): Promise<any | null> {
  const adapter = getAdapter();
  const trackId = extractSpotifyTrackId(uri);
  const keys = [uri, `byuri:${uri}`];
  if (trackId) keys.push(trackId);
  for (const k of keys) {
    const data = await adapter.get<any>(`${FALLBACK_PREFIX}${k}`);
    if (data?.encoded) { Logger.info(`[SpotiFailCache] Hit ${k}`); return data; }
  }
  return null;
}

async function setFallbackCache(uri: string, track: any): Promise<void> {
  const adapter = getAdapter();
  const data = {
    encoded: track.encoded || null,
    title: track.info?.title || "",
    author: track.info?.author || "",
    thumbnail: track.info?.artworkUrl || null,
  };
  await adapter.set(`${FALLBACK_PREFIX}${uri}`, data, FALLBACK_TTL);
  const trackId = extractSpotifyTrackId(uri);
  if (trackId) await adapter.set(`${FALLBACK_PREFIX}${trackId}`, data, FALLBACK_TTL);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function titleSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const wordsA = na.split(/\s+/);
  const wordsB = nb.split(/\s+/);
  let match = 0;
  for (const w of wordsA) {
    if (wordsB.some((wb: string) => wb.includes(w) || w.includes(wb))) match++;
  }
  return match / Math.max(wordsA.length, wordsB.length);
}

function pickBestMatch(tracks: any[], expectedMs: number | null, expectedTitle: string) {
  if (!tracks?.length) return null;
  if (tracks.length === 1) return tracks[0];
  let best = tracks[0];
  let bestScore = -1;
  for (const t of tracks) {
    const ytTitle = t.info?.title || "";
    const sim = titleSimilarity(ytTitle, expectedTitle);
    const durationDiff = expectedMs ? Math.abs((t.info?.duration || 0) - expectedMs) : Infinity;
    const durationScore = durationDiff < 5000 ? 1 : durationDiff < 15000 ? 0.5 : durationDiff < 30000 ? 0.2 : 0;
    const score = sim * 0.7 + durationScore * 0.3;
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

async function searchWithFallback(player: any, item: any, user: any) {
  if (item.spotifyUri) {
    const cached = await getFallbackCache(item.spotifyUri);
    if (cached?.encoded) {
      const best: any = { encoded: cached.encoded, info: {}, _spotifyUri: item.spotifyUri };
      best.info.title = cached.title;
      best.info.author = cached.author;
      best.info.artworkUrl = cached.thumbnail;
      applySpotifyMeta(best, {
        title: item.name || cached.title || null,
        author: item.artists?.join(", ") || cached.author || null,
        spotifyUrl: item.spotifyUri || null,
      });
      return best;
    }
  }
  for (const prefix of ["ytsearch", "ytmsearch", "scsearch", "dzsearch"]) {
    const result = await searchWithRetry(player, { query: `${prefix}:${item.query}` }, user, 0);
    if (result?.tracks?.length) {
      const best = pickBestMatch(result.tracks, item.duration, item.query);
      if (best) {
        best._spotifyUri = item.spotifyUri;
        applySpotifyMeta(best, {
          title: item.name || null,
          author: item.artists?.join(", ") || null,
          spotifyUrl: item.spotifyUri || null,
        });
        if (item.spotifyUri && best.encoded) setFallbackCache(item.spotifyUri, best).catch(() => {});
      }
      return best;
    }
  }
  return null;
}

function spotifyUriToUrl(uri: string | null | undefined): string | null {
  if (!uri) return null;
  if (uri.startsWith("http")) return uri;
  const m = uri.match(/^spotify:(track|album|playlist):([a-zA-Z0-9]+)$/);
  if (m) return `https://open.spotify.com/${m[1]}/${m[2]}`;
  return null;
}

async function trySpotifyFallback(engine: any, player: any, guildId: string, query: string, user: any, saveState: Function): Promise<any> {
  Logger.info(`[PLAY] Lavalink lacks spotify plugin, using scraper fallback...`);
  let fallbackTracks: any[] | null = null;

  try {
    const scraped = await SpotifyScraper.scrape(query);
    if (scraped?.length) fallbackTracks = scraped;
  } catch (scrapeErr: any) {
    Logger.info(`[PLAY] Spotify scraper failed: ${scrapeErr.message}`);
  }

  if (!fallbackTracks) {
    const parsed = SpotifyScraper.parseUrl(query);
    if (parsed?.type === "track") {
      const oembedData = await SpotifyScraper.fetchOEmbed(parsed.id);
      if (oembedData?.entity) {
        const e = oembedData.entity;
        const artistNames = (e.artists || []).map((a: any) => a.name).filter(Boolean);
        fallbackTracks = [{
          name: e.title || "",
          artists: artistNames,
          query: `${artistNames.join(" ")} ${e.title || ""}`.trim(),
          duration: null,
          spotifyUri: e.uri || `spotify:track:${parsed.id}`,
        }];
      }
    }
  }

  if (!fallbackTracks?.length) {
    throw new Error("Spotify playback is not available — Lavalink server lacks the Spotify plugin.");
  }

  return processTracks(engine, player, guildId, fallbackTracks, query, user, saveState);
}

async function processTracks(engine: any, player: any, guildId: string, scrapedTracks: any[], query: string, user: any, saveState: Function): Promise<any> {
  const allTracks = [];
  const batchSize = 20;
  for (let b = 0; b < scrapedTracks.length; b += batchSize) {
    const batch = scrapedTracks.slice(b, b + batchSize);
    const results = await Promise.allSettled(
      batch.map((item: any) => searchWithFallback(player, item, user)),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        const track = r.value;
        if (!track.info) track.info = {};
        const individualUrl = spotifyUriToUrl(track._spotifyUri) || query;
        track.info.originalUrl = individualUrl;
        delete track._spotifyUri;
        allTracks.push(track);
      }
    }
  }

  if (!allTracks.length) throw new Error("No playable tracks found from Spotify.");

  const existingUrls = new Set(engine.queue.getAll().map((t: any) => t.info?.originalUrl || t.info?.uri));
  const deduped = allTracks.filter((t: any) => !existingUrls.has(t.info?.originalUrl));
  const targetTracks = deduped.length ? deduped : (deduped.length === 0 && engine.queue.getAll().length > 0 ? [] : allTracks);
  if (targetTracks.length === 0 && deduped.length === 0) throw new Error("All tracks are already in the queue.");

  const wasPlaying = player.playing || player.paused || engine.queue.getAll().length > 0;
  const currentLen = engine.queue.getAll().length;
  const space = botConfig.maxQueue - currentLen;
  const addable = space < targetTracks.length ? targetTracks.slice(0, space) : targetTracks;
  if (addable.length === 0) throw new Error("Queue full.");

  if (wasPlaying) {
    await withQueueLock(guildId, async () => {
      engine.queue.addMultiple(addable);
    });
   } else {
     await withQueueLock(guildId, async () => {
       engine.queue.clear();
       engine.queue.addMultiple(addable);
       const first = engine.queue.next();
       if (first) await player.play({ track: first, clientTrack: first });
     });
   }

  await ActivityService.log({
    guildId,
    userId: user.id,
    userName: user.displayName || user.username,
    action: wasPlaying ? "queue" : "play",
    detail: allTracks.length > 1 ? `Added playlist (${allTracks.length} songs)` : (wasPlaying ? `Queued ${allTracks[0]?.info?.title || "unknown track"}` : `Played ${allTracks[0]?.info?.title || "unknown track"}`),
    songTitle: allTracks[0]?.info?.title,
    artist: allTracks[0]?.info?.artist
  });

  await saveState(guildId);
  return {
    engine, player,
    result: { tracks: allTracks, loadType: allTracks.length > 1 ? "playlist" : "track", spotifyTotal: allTracks.length },
    track: allTracks[0],
    wasPlaying,
  };
}

export { trySpotifyFallback, searchWithFallback as searchSpotifyOnYoutube, spotifyUriToUrl };
