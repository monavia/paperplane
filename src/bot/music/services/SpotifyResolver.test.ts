import { describe, expect, test, vi } from "vitest";
import { verifySpotifyMatch, buildQueryVariants, resolveSpotifyTrack } from "./SpotifyResolver.js";

function mk(title: string, author: string, duration = 180_000) {
  return { info: { title, author, uri: `https://youtu.be/${encodeURIComponent(title)}`, duration, length: duration, sourceName: "youtube" } };
}

function mkSpotify(name: string, artists: string[], duration = 180_000) {
  return { name, artists, duration, spotifyUri: `spotify:track:${encodeURIComponent(name)}` };
}

describe("verifySpotifyMatch", () => {
  test("exact latin match passes", () => {
    const track = mk("Manusia Bodoh", "Ada Band - Topic");
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"]);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("case/punct-insensitive match passes", () => {
    const track = mk("FLOWER POWER (Official Music Video)", "Girls' Generation");
    const item = mkSpotify("Flower Power", ["Girls' Generation"]);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("thai studio version passes", () => {
    const track = mk("คิด(แต่ไม่)ถึง (Official Audio)", "Same Page - Topic", 183_000);
    const item = mkSpotify("คิด(แต่ไม่)ถึง", ["Same Page"], 183_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("thai live concert version rejected", () => {
    const track = mk("คิด(แต่ไม่)ถึง คอนเสิร์ต", "Same Page", 240_000);
    const item = mkSpotify("คิด(แต่ไม่)ถึง", ["Same Page"], 183_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
  });

  test("latin live version rejected", () => {
    const track = mk("Manusia Bodoh (Live)", "Ada Band", 300_000);
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"], 180_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
  });

  test("cover rejected", () => {
    const track = mk("Manusia Bodoh (Cover by Budi)", "Budi", 180_000);
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"], 180_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
  });

  test("artist mismatch rejected", () => {
    const track = mk("Manusia Bodoh", "Bukan Ada Band", 180_000);
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"], 180_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
  });

  test("feat. artist still passes", () => {
    const track = mk("Flower Power (feat. X)", "Girls' Generation - Topic", 180_000);
    const item = mkSpotify("Flower Power", ["Girls' Generation", "X"], 180_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("duration far off rejected (>90s)", () => {
    const track = mk("Manusia Bodoh", "Ada Band - Topic", 300_000);
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"], 180_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
  });

  test("duration within tolerance passes", () => {
    const track = mk("Manusia Bodoh", "Ada Band - Topic", 184_000);
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"], 180_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("empty spotify artists does not block", () => {
    const track = mk("Manusia Bodoh", "Ada Band - Topic", 180_000);
    const item = { name: "Manusia Bodoh", artists: [], duration: 180_000 };
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });
});

describe("buildQueryVariants", () => {
  test("produces artist+title, title-only, title+artist", () => {
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"]);
    expect(buildQueryVariants(item)).toEqual(["Ada Band Manusia Bodoh", "Manusia Bodoh", "Manusia Bodoh Ada Band"]);
  });

  test("empty item produces no variants", () => {
    expect(buildQueryVariants({ name: "", artists: [] })).toEqual([]);
  });
});

describe("resolveSpotifyTrack", () => {
  test("returns verified track from first variant", async () => {
    const searchFn = vi.fn(async (_p: any, qo: any) => ({ tracks: [mk("Manusia Bodoh", "Ada Band - Topic")] }));
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"]);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).not.toBeNull();
    expect(result.info.title).toBe("Manusia Bodoh");
    expect(result.info.author).toBe("Ada Band");
    expect(result.info.spotifyUrl).toBe(item.spotifyUri);
    expect(searchFn).toHaveBeenCalledTimes(1);
    expect(searchFn.mock.calls[0][1].query).toBe("ytmsearch:Ada Band Manusia Bodoh");
  });

  test("falls through to title-only variant when artist+title fails", async () => {
    const searchFn = vi.fn(async (_p: any, qo: any) => {
      if (qo.query === "ytmsearch:Ada Band Manusia Bodoh") {
        return { tracks: [mk("Manusia Bodoh (Live)", "Ada Band", 300_000)] };
      }
      return { tracks: [mk("Manusia Bodoh", "Ada Band - Topic", 180_000)] };
    });
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"], 180_000);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).not.toBeNull();
    expect(result.info.title).toBe("Manusia Bodoh");
    expect(searchFn).toHaveBeenCalledTimes(2);
    expect(searchFn.mock.calls[1][1].query).toBe("ytmsearch:Manusia Bodoh");
  });

  test("skips live track inside a multi-track result", async () => {
    const searchFn = vi.fn(async () => ({
      tracks: [mk("Manusia Bodoh (Live)", "Ada Band", 300_000), mk("Manusia Bodoh", "Ada Band - Topic", 180_000)],
    }));
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"], 180_000);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).not.toBeNull();
    expect(result.info.title).toBe("Manusia Bodoh");
  });

  test("returns best-effort track when all variants unverified", async () => {
    const searchFn = vi.fn(async () => ({ tracks: [mk("Manusia Bodoh (Live)", "Ada Band", 300_000)] }));
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"], 180_000);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).not.toBeNull();
    expect(result.info.title).toBe("Manusia Bodoh");
    expect(searchFn).toHaveBeenCalledTimes(3);
  });

  test("returns null when no tracks at all", async () => {
    const searchFn = vi.fn(async () => ({ tracks: [] }));
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"]);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).toBeNull();
  });
});
