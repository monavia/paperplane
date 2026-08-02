import Logger from "../../core/utils/Logger.js";
import * as dns from "node:dns/promises";
import * as net from "node:net";
import { getAdapter } from "../../cache/CacheAdapter.js";

const SPOTIFY_PREFIX = "spotify:";
const CACHE_TTL = 86_400_000;
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;
const SPOTIFY_HOST = "open.spotify.com";

class SpotifyScraper {
  headers: any;

  constructor() {
    this.headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.5",
    };
  }

  private async getCached(key: string): Promise<any> {
    const data = await getAdapter().get(`${SPOTIFY_PREFIX}${key}`);
    if (data) Logger.info(`[SpotifyScraper] Cache hit ${key}`);
    return data;
  }

  private async setCached(key: string, data: any): Promise<void> {
    await getAdapter().set(`${SPOTIFY_PREFIX}${key}`, data, CACHE_TTL);
  }

  _getDurationMs(item: any): any {
    if (item.duration_ms) return item.duration_ms;
    if (item.durationMs) return item.durationMs;
    if (typeof item.duration === "number") return item.duration < 100000 ? item.duration * 1000 : item.duration;
    if (item.duration?.totalMilliseconds) return item.duration.totalMilliseconds;
    if (item.track?.duration_ms) return item.track.duration_ms;
    return null;
  }

  parseUrl(url: any): any {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.hostname !== SPOTIFY_HOST) return null;
    const m = parsed.pathname.match(/^\/(?:[\w-]+\/)?(playlist|track|album)\/([a-zA-Z0-9]+)/);
    if (!m) return null;
    return { type: m[1], id: m[2] };
  }

  async scrape(url: any): Promise<any> {
    const parsed = this.parseUrl(url);
    if (!parsed) return null;
    if (parsed.type === "playlist") return this.scrapePlaylist(parsed.id);
    if (parsed.type === "track") return this.scrapeTrack(parsed.id);
    if (parsed.type === "album") return this.scrapeAlbum(parsed.id);
    return null;
  }

  async scrapePlaylist(id: any): Promise<any> {
    const cacheKey = `playlist:${id}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    const tracks = await this._scrapeCollection("playlist", id, cacheKey, "Could not extract playlist data from Spotify");
    Logger.info(`[SpotifyScraper] Embed: ${tracks.length} tracks`);
    return tracks;
  }

  async scrapeTrack(id: any): Promise<any> {
    const cacheKey = `track:${id}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    const data = await this._fetchEntity("track", id);
    if (!data?.entity) throw new Error("Could not extract track data from Spotify");
    const e = data.entity;
    const artistNames = (e.artists || []).map((a: any) => a.name).filter(Boolean);
    const result = [{
      name: e.title || e.name || "",
      artists: artistNames,
      query: `${artistNames.join(" ")} ${e.title || e.name || ""}`.trim(),
      duration: this._getDurationMs(e),
      spotifyUri: e.uri || `spotify:track:${id}`,
    }];
    await this.setCached(cacheKey, result);
    return result;
  }

  async scrapeAlbum(id: any): Promise<any> {
    const cacheKey = `album:${id}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    return this._scrapeCollection("album", id, cacheKey, "Could not extract album data from Spotify");
  }

  private async _scrapeCollection(type: any, id: any, cacheKey: string, errorMsg: string): Promise<any> {
    // Spotify embed ignores ?offset= — it always serves the same first ~100 tracks.
    // Single fetch is all there is; no point paginating.
    const data = await this._fetchEntity(type, id, 0);
    const mapped = data?.entity?.trackList?.length
      ? data.entity.trackList.map((t: any) => ({
          name: t.title,
          artists: t.subtitle ? [t.subtitle] : [],
          query: `${t.subtitle || ""} ${t.title}`.trim(),
          duration: this._getDurationMs(t),
          spotifyUri: t.uri || t.id || null,
        }))
      : [];
    const unique = this._deduplicate(mapped);
    if (!unique.length) throw new Error(errorMsg);
    await this.setCached(cacheKey, unique);
    return unique;
  }

  _deduplicate(tracks: any[]): any[] {
    const seen = new Set();
    return tracks.filter((t: any) => { const k = t.query.toLowerCase().replace(/\s+/g, " "); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  async _fetchEntity(type: any, id: any, offset: any = 0): Promise<any> {
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}${offset ? `?offset=${offset}` : ""}`;
    const embedHtml = await this._fetchPage(embedUrl).catch(() => null);
    if (embedHtml) {
      const match = embedHtml.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s);
      if (match) {
        try { const json = JSON.parse(match[1]); const d = json.props?.pageProps?.state?.data; if (d) return d; } catch { Logger.safe("SpotifyScraper")(); }
      }
      Logger.info(`[SpotifyScraper] Embed ${type}/${id}: html ${embedHtml.length}B, __NEXT_DATA__ ${match ? "found" : "missing"}`);
    } else {
      Logger.info(`[SpotifyScraper] Embed ${type}/${id}: fetch failed`);
    }
    if (type === "track") return this.fetchOEmbed(id);
    return null;
  }

  async fetchOEmbed(id: string): Promise<any> {
    const cacheKey = `oembed:${id}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;
    for (let a = 0; a <= MAX_RETRIES; a++) {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 10000);
      try {
        const r = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${id}`, { headers: this.headers, signal: c.signal });
        if (!r.ok) { if (a < MAX_RETRIES) { await new Promise(r => setTimeout(r, RETRY_DELAY * (a + 1))); continue; } return null; }
        const d: any = await r.json();
        if (d?.title) { const r2 = { entity: { title: d.title, artists: [{ name: d.author_name }], uri: `spotify:track:${id}` } }; await this.setCached(cacheKey, r2); return r2; }
        return null;
      } catch { if (a < MAX_RETRIES) { await new Promise(r => setTimeout(r, RETRY_DELAY * (a + 1))); continue; } return null; }
      finally { clearTimeout(t); }
    }
    return null;
  }

  async _validateUrl(url: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    if (parsed.protocol !== "https:") throw new Error(`URL must be HTTPS: ${url}`);
    if (parsed.hostname !== SPOTIFY_HOST) throw new Error(`URL host must be ${SPOTIFY_HOST}: ${url}`);
    if (net.isIP(parsed.hostname)) {
      if (this._isPrivateIP(parsed.hostname)) throw new Error(`URL resolves to private IP: ${url}`);
    } else {
      const addrs = await dns.resolve4(parsed.hostname);
      for (const addr of addrs) {
        if (this._isPrivateIP(addr)) throw new Error(`URL resolves to private IP: ${url}`);
      }
    }
  }

  _isPrivateIP(ip: string): boolean {
    const p = ip.split(".").map(Number);
    if (p.length !== 4) return true;
    if (p[0] === 10) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 0) return true;
    return false;
  }

  async _fetchPage(url: any): Promise<any> {
    await this._validateUrl(url);
    for (let a = 0; a <= MAX_RETRIES; a++) {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000);
      try {
        const r = await fetch(url, { headers: this.headers, signal: c.signal });
        if (!r.ok) {
          if (a < MAX_RETRIES) {
            await new Promise(res => setTimeout(res, RETRY_DELAY * (a + 1)));
            continue;
          }
          throw new Error(`Spotify ${r.status}`);
        }
        const text = await r.text();
        Logger.info(`[SpotifyScraper] FETCH ${url} → ${r.status} ${text.length}B`);
        return text;
      } catch (e: any) {
        if (a < MAX_RETRIES && (e.name === "AbortError" || e.message.includes("fetch"))) {
          await new Promise(res => setTimeout(res, RETRY_DELAY * (a + 1)));
          continue;
        }
        throw e;
      }
      finally { clearTimeout(t); }
    }
  }

}

const _instance = new SpotifyScraper();
export const parseUrl = _instance.parseUrl.bind(_instance);
export const scrape = _instance.scrape.bind(_instance);
export const fetchOEmbed = _instance.fetchOEmbed.bind(_instance);
