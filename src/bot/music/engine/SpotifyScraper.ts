import Logger from "../../core/utils/Logger";

const CACHE_TTL = 30 * 60 * 1000;
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

interface CacheEntry {
  data: any;
  expiry: number;
}

class SpotifyScraper {
  headers: any;
  private cache: Map<string, CacheEntry> = new Map();

  constructor() {
    this.headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.5",
    };
  }

  private getCache(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) { this.cache.delete(key); return null; }
    return entry.data;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
    if (this.cache.size > 500) this.pruneCache();
  }

  private pruneCache(): void {
    const now = Date.now();
    for (const [k, v] of this.cache) {
      if (now > v.expiry) this.cache.delete(k);
    }
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
    const m = url.match(/open\.spotify\.com\/(?:[\w-]+\/)?(playlist|track|album)\/([a-zA-Z0-9]+)/);
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
    const cached = this.getCache(cacheKey);
    if (cached) { Logger.info(`[SpotifyScraper] Cache hit playlist/${id}`); return cached; }

    const allTracks: any[] = [];
    let offset = 0;
    while (allTracks.length < 500) {
      const data = await this._fetchEntity("playlist", id, offset);
      if (!data?.entity?.trackList?.length) break;
      const mapped = data.entity.trackList.map((t: any) => ({
        name: t.title,
        artists: t.subtitle ? [t.subtitle] : [],
        query: `${t.subtitle || ""} ${t.title}`.trim(),
        duration: this._getDurationMs(t),
        spotifyUri: t.uri || t.id || null,
      }));
      allTracks.push(...mapped);
      if (mapped.length < 50) break;
      offset += 50;
    }

    const unique = this._deduplicate(allTracks);
    if (unique.length) { Logger.info(`[SpotifyScraper] Embed path: ${unique.length} tracks`); this.setCache(cacheKey, unique); return unique; }

    Logger.info(`[SpotifyScraper] Embed path empty, trying HTML scrape`);
    const html = await this._fetchPage(`https://open.spotify.com/playlist/${id}`);
    const htmlTracks = this._extractFromHtml(html);
    if (htmlTracks?.length) { Logger.info(`[SpotifyScraper] HTML scrape: ${htmlTracks.length} tracks`); this.setCache(cacheKey, htmlTracks); return htmlTracks; }

    throw new Error("Could not extract playlist data from Spotify");
  }

  async scrapeTrack(id: any): Promise<any> {
    const cacheKey = `track:${id}`;
    const cached = this.getCache(cacheKey);
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
    this.setCache(cacheKey, result);
    return result;
  }

  async scrapeAlbum(id: any): Promise<any> {
    const cacheKey = `album:${id}`;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const data = await this._fetchEntity("album", id);
    if (data?.entity?.trackList?.length) {
      const mapped = data.entity.trackList.map((t: any) => ({
        name: t.title, artists: t.subtitle ? [t.subtitle] : [],
        query: `${t.subtitle || ""} ${t.title}`.trim(),
        duration: this._getDurationMs(t), spotifyUri: t.uri || t.id || null,
      }));
      const unique = this._deduplicate(mapped);
      if (unique.length) { this.setCache(cacheKey, unique); return unique; }
    }

    const html = await this._fetchPage(`https://open.spotify.com/album/${id}`);
    const tracks = this._extractFromHtml(html);
    if (tracks?.length) { this.setCache(cacheKey, tracks); return tracks; }

    throw new Error("Could not extract album data from Spotify");
  }

  async _fetchEntity(type: any, id: any, offset: any = 0): Promise<any> {
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}${offset ? `?offset=${offset}` : ""}`;
    const embedHtml = await this._fetchPage(embedUrl).catch(() => null);
    if (embedHtml) {
      const match = embedHtml.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s);
      if (match) {
        try { const json = JSON.parse(match[1]); const d = json.props?.pageProps?.state?.data; if (d) return d; } catch {}
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
    const cached = this.getCache(cacheKey);
    if (cached) return cached;
    for (let a = 0; a <= MAX_RETRIES; a++) {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 10000);
      try {
        const r = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${id}`, { headers: this.headers, signal: c.signal });
        if (!r.ok) { if (a < MAX_RETRIES) { await new Promise(r => setTimeout(r, RETRY_DELAY * (a + 1))); continue; } return null; }
        const d: any = await r.json();
        if (d?.title) { const r2 = { entity: { title: d.title, artists: [{ name: d.author_name }], uri: `spotify:track:${id}` } }; this.setCache(cacheKey, r2); return r2; }
        return null;
      } catch { if (a < MAX_RETRIES) { await new Promise(r => setTimeout(r, RETRY_DELAY * (a + 1))); continue; } return null; }
      finally { clearTimeout(t); }
    }
    return null;
  }

  async _fetchPage(url: any): Promise<any> {
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

  _extractFromHtml(html: any): any {
    const n = html.match(/<script id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
    if (n) { try { const d = JSON.parse(n[1]); const c = this._findAllItems(d); if (c.length) { const b = c.reduce((a: any, b: any) => a.length >= b.length ? a : b); if (b?.length) return this._mapTracks(b); } } catch {} }
    const s = html.match(/<script[^>]*type="text\/json"[^>]*>([A-Za-z0-9+/=]+)<\/script>/);
    if (s) { try { const d = JSON.parse(Buffer.from(s[1], "base64").toString("utf-8")); const c = this._findAllItems(d); if (c.length) { const b = c.reduce((a: any, b: any) => a.length >= b.length ? a : b); if (b?.length) return this._mapTracks(b); } } catch {} }
    const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*\n?<\/script>/);
    if (m) { try { const d = JSON.parse(m[1]); const c = this._findAllItems(d); if (c.length) { const b = c.reduce((a: any, b: any) => a.length >= b.length ? a : b); if (b?.length) return this._mapTracks(b); } } catch {} }
    return null;
  }

  _findAllItems(obj: any, results: any[] = [], depth: number = 0): any[] {
    if (!obj || typeof obj !== "object" || depth > 8) return results;
    if (Array.isArray(obj)) { for (const i of obj) this._findAllItems(i, results, depth + 1); return results; }
    if (obj.items && Array.isArray(obj.items) && (obj.items[0]?.track?.name || obj.items[0]?.name || obj.items[0]?.title)) results.push(obj.items);
    if (obj.trackList && Array.isArray(obj.trackList)) results.push(obj.trackList);
    if (obj.data?.playlistV2?.content?.items) results.push(obj.data.playlistV2.content.items);
    if (obj.playlist?.tracks?.items) results.push(obj.playlist.tracks.items);
    if (obj.tracks && Array.isArray(obj.tracks)) results.push(obj.tracks);
    if (results.length) return results;
    for (const k of Object.keys(obj)) { this._findAllItems(obj[k], results, depth + 1); if (results.length) break; }
    return results;
  }

  _deduplicate(tracks: any[]): any[] {
    const seen = new Set();
    return tracks.filter((t: any) => { const k = t.query.toLowerCase().replace(/\s+/g, " "); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  _mapTracks(items: any[]): any[] {
    return items.map((item: any) => {
      let track: any;
      if (item.title && item.subtitle) return { name: item.title, artists: item.subtitle ? [item.subtitle] : [], query: `${item.subtitle || ""} ${item.title}`.trim(), duration: this._getDurationMs(item), spotifyUri: item.uri || null };
      if (item.itemV2?.data) track = item.itemV2.data; else if (item.track) track = item.track; else track = item;
      const name = track.name || track.title || "";
      const artistArr: any[] = [];
      if (track.artists?.items) for (const a of track.artists.items) { if (a.profile?.name) artistArr.push(a.profile.name); else if (a.name) artistArr.push(a.name); }
      else if (track.artists && Array.isArray(track.artists)) for (const a of track.artists) { if (typeof a === "string") artistArr.push(a); else if (a.name) artistArr.push(a.name); }
      else if (track.subtitle) artistArr.push(track.subtitle);
      return { name, artists: artistArr, query: `${artistArr.join(" ")} ${name}`.trim(), duration: this._getDurationMs(track), spotifyUri: track.uri || track.id || null };
    }).filter((t: any) => t.name);
  }
}

const _instance = new SpotifyScraper();
export const parseUrl = _instance.parseUrl.bind(_instance);
export const scrape = _instance.scrape.bind(_instance);
export const fetchOEmbed = _instance.fetchOEmbed.bind(_instance);
