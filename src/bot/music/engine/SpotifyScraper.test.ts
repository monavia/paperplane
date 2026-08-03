import { describe, test, vi, beforeEach } from "vitest";
import assert from "node:assert";
import { parseUrl, scrape, splitArtists } from "./SpotifyScraper.js";

const { cache } = vi.hoisted(() => ({ cache: new Map<string, any>() }));

vi.mock("../../cache/CacheAdapter.js", () => ({
  getAdapter: () => ({
    get: async (k: string) => cache.get(k) || null,
    set: async (k: string, v: any) => { cache.set(k, v); },
  }),
}));

vi.mock("node:dns/promises", () => ({
  resolve4: async () => ["104.16.0.1"],
}));

function embedHtml(tracks: any[]): string {
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { state: { data: { entity: { trackList: tracks } } } } },
  })}</script>`;
}

function mkTrack(i: number): any {
  return { title: `Song ${i}`, subtitle: "Artist", uri: `spotify:track:${1000 + i}` };
}

describe("SpotifyScraper parseUrl", () => {
  test("returns null for non-spotify urls", () => {
    assert.strictEqual(parseUrl("https://google.com"), null);
  });

  test("returns null for invalid urls", () => {
    assert.strictEqual(parseUrl("not-a-url"), null);
  });

  test("parses playlist", () => {
    const r = parseUrl("https://open.spotify.com/playlist/abc123");
    assert.deepStrictEqual(r, { type: "playlist", id: "abc123" });
  });

  test("parses track", () => {
    const r = parseUrl("https://open.spotify.com/track/xyz789");
    assert.deepStrictEqual(r, { type: "track", id: "xyz789" });
  });

  test("parses album", () => {
    const r = parseUrl("https://open.spotify.com/album/def456");
    assert.deepStrictEqual(r, { type: "album", id: "def456" });
  });

  test("rejects non-spotify hostname in valid URL", () => {
    assert.strictEqual(parseUrl("https://youtube.com/playlist/abc"), null);
  });

  test("rejects URL with wrong path format", () => {
    assert.strictEqual(parseUrl("https://open.spotify.com/artist/abc"), null);
  });
});

describe("SpotifyScraper splitArtists", () => {
  test("single artist stays intact", () => {
    assert.deepStrictEqual(splitArtists("Ada Band"), ["Ada Band"]);
  });

  test("comma-joined artists split", () => {
    assert.deepStrictEqual(splitArtists("Lindsey Stirling, Mako"), ["Lindsey Stirling", "Mako"]);
  });

  test("ampersand-joined artists split", () => {
    assert.deepStrictEqual(splitArtists("Lindsey Stirling & Mako"), ["Lindsey Stirling", "Mako"]);
  });

  test("ft. joined artists split", () => {
    assert.deepStrictEqual(splitArtists("Allan ft. X"), ["Allan", "X"]);
  });

  test("feat. joined artists split", () => {
    assert.deepStrictEqual(splitArtists("DJ feat. M"), ["DJ", "M"]);
  });

  test("empty or missing subtitle returns empty array", () => {
    assert.deepStrictEqual(splitArtists(""), []);
    assert.deepStrictEqual(splitArtists(undefined as unknown as string), []);
  });
});

describe("SpotifyScraper scrape playlist", () => {
  beforeEach(() => cache.clear());

  test("maps comma-joined subtitle to a separate artists array", async () => {
    const tracks = [{ title: "Lose You Now", subtitle: "Lindsey Stirling, Mako", uri: "spotify:track:500" }];
    const fetchMock = vi.fn(async () => new Response(embedHtml(tracks), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await scrape("https://open.spotify.com/playlist/abc123");
    assert.deepStrictEqual(result[0].artists, ["Lindsey Stirling", "Mako"]);
    assert.strictEqual(result[0].query, "Lindsey Stirling Mako Lose You Now");
    vi.unstubAllGlobals();
  });

  test("returns embed tracks with a single fetch when offset is ignored", async () => {
    const tracks = Array.from({ length: 100 }, (_, i) => mkTrack(i));
    const fetchMock = vi.fn(async () => new Response(embedHtml(tracks), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await scrape("https://open.spotify.com/playlist/abc123");
    assert.strictEqual(result.length, 100);
    assert.strictEqual(fetchMock.mock.calls.length, 1);
    vi.unstubAllGlobals();
  });

  test("deduplicates repeated tracks in embed payload", async () => {
    const tracks = [mkTrack(1), mkTrack(2), mkTrack(1)];
    const fetchMock = vi.fn(async () => new Response(embedHtml(tracks), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await scrape("https://open.spotify.com/playlist/abc123");
    assert.strictEqual(result.length, 2);
    assert.strictEqual(fetchMock.mock.calls.length, 1);
    vi.unstubAllGlobals();
  });

  test("throws when embed has no tracks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(embedHtml([]), { status: 200 })));
    await assert.rejects(
      () => scrape("https://open.spotify.com/playlist/abc123"),
      /Could not extract playlist data from Spotify/
    );
    vi.unstubAllGlobals();
  });
});
