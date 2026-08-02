import { describe, expect, test, vi } from "vitest";
import { verifySpotifyMatch, buildQueryVariants, buildSpotifyItemFromTrack, resolveStoredSpotifyTrack, resolveSpotifyTrack } from "./SpotifyResolver.js";

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

  test("karaoke version rejected", () => {
    const track = mk("Lay All Your Love On Me (Karaoke Version)", "ABBA - Topic", 270_000);
    const item = mkSpotify("Lay All Your Love On Me", ["ABBA"], 269_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
  });

  test("karaoke in non-latin script rejected", () => {
    const track = mk("เพลงรัก (คาราโอเกะ)", "นักร้อง", 180_000);
    const item = mkSpotify("เพลงรัก", ["นักร้อง"], 180_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
  });

  test("spotify item that is itself karaoke still passes", () => {
    const track = mk("Lay All Your Love On Me (Karaoke Version)", "Karaoke Universe", 270_000);
    const item = mkSpotify("Lay All Your Love On Me (Karaoke Version)", ["Karaoke Universe"], 270_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("instrumental version rejected", () => {
    const track = mk("Lay All Your Love On Me (Instrumental)", "ABBA - Topic", 269_000);
    const item = mkSpotify("Lay All Your Love On Me", ["ABBA"], 269_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
  });

  test("violin version rejected", () => {
    const track = mk("Lay All Your Love On Me (Violin)", "ABBA - Topic", 269_000);
    const item = mkSpotify("Lay All Your Love On Me", ["ABBA"], 269_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
  });

  test("violin solo version rejected", () => {
    const track = mk("Lay All Your Love On Me (Violin Solo)", "ABBA - Topic", 269_000);
    const item = mkSpotify("Lay All Your Love On Me", ["ABBA"], 269_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
  });

  test("chinese instrumental version rejected", () => {
    const track = mk("Lay All Your Love On Me 纯音乐", "ABBA - Topic", 269_000);
    const item = mkSpotify("Lay All Your Love On Me", ["ABBA"], 269_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
  });

  test("song title containing instrument word without parens passes", () => {
    const track = mk("Piano Man", "Billy Joel - Topic", 270_000);
    const item = mkSpotify("Piano Man", ["Billy Joel"], 270_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("empty spotify artists does not block", () => {
    const track = mk("Manusia Bodoh", "Ada Band - Topic", 180_000);
    const item = { name: "Manusia Bodoh", artists: [], duration: 180_000 };
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("duet artist with joined collaborators passes", () => {
    const track = mk("Lose You Now", "Lindsey Stirling, Mako", 236_000);
    const item = mkSpotify("Lose You Now", ["Lindsey Stirling", "Mako"], 236_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("duet artist with & or ft. formatting passes", () => {
    const item = mkSpotify("Lose You Now", ["Lindsey Stirling", "Mako"], 236_000);
    expect(verifySpotifyMatch(item, mk("Lose You Now", "Lindsey Stirling & Mako", 236_000))).toBe(true);
    expect(verifySpotifyMatch(item, mk("Lose You Now", "Lindsey Stirling ft. Mako", 236_000))).toBe(true);
  });

  test("unknown extra artist token still rejected", () => {
    const track = mk("If Walls Could Talk", "If Walls Could Talk", 183_000);
    const item = mkSpotify("If Walls Could Talk", ["Halsey"], 183_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
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

  test("returns null when all variants unverified (no best-effort)", async () => {
    const searchFn = vi.fn(async () => ({ tracks: [mk("Manusia Bodoh (Live)", "Ada Band", 300_000)] }));
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"], 180_000);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).toBeNull();
    expect(searchFn).toHaveBeenCalledTimes(4);
  });

  test("falls back to Deezer when YouTube has no strict match", async () => {
    const searchFn = vi.fn(async (_p: any, qo: any) => {
      if (qo.query.startsWith("ytmsearch:")) {
        return { tracks: [mk("If Walls Could Talk", "If Walls Could Talk", 183_000)] };
      }
      return { tracks: [mk("If Walls Could Talk", "Halsey", 183_000)] };
    });
    const item = mkSpotify("If Walls Could Talk", ["Halsey"], 183_000);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).not.toBeNull();
    expect(result.info.title).toBe("If Walls Could Talk");
    expect(result.info.author).toBe("Halsey");
    expect(result.info.spotifyUrl).toBe(item.spotifyUri);
    expect(searchFn.mock.calls[searchFn.mock.calls.length - 1][1].query).toBe("dzsearch:Halsey If Walls Could Talk");
  });

  test("skips when Deezer fallback also fails strict verification", async () => {
    const searchFn = vi.fn(async () => ({ tracks: [mk("If Walls Could Talk", "If Walls Could Talk", 183_000)] }));
    const item = mkSpotify("If Walls Could Talk", ["Halsey"], 183_000);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).toBeNull();
  });

  test("uses primary artist only for Deezer fallback on duet tracks", async () => {
    const searchFn = vi.fn(async (_p: any, qo: any) => {
      if (qo.query.startsWith("ytmsearch:")) return { tracks: [mk("Lose You Now", "Wrong Artist", 236_000)] };
      return { tracks: [mk("Lose You Now", "Lindsey Stirling", 236_000)] };
    });
    const item = mkSpotify("Lose You Now", ["Lindsey Stirling", "Mako"], 236_000);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).not.toBeNull();
    expect(searchFn.mock.calls[searchFn.mock.calls.length - 1][1].query).toBe("dzsearch:Lindsey Stirling Lose You Now");
  });

  test("returns null when no tracks at all", async () => {
    const searchFn = vi.fn(async () => ({ tracks: [] }));
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"]);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).toBeNull();
  });
});

describe("buildSpotifyItemFromTrack", () => {
  test("reconstructs item from stored spotify metadata", () => {
    const stored = { info: { title: "Lay All Your Love On Me", author: "ABBA, Benny Andersson", duration: 269_000, spotifyUrl: "spotify:track:abc" } };
    const item = buildSpotifyItemFromTrack(stored);
    expect(item).not.toBeNull();
    expect(item.name).toBe("Lay All Your Love On Me");
    expect(item.artists).toEqual(["ABBA", "Benny Andersson"]);
    expect(item.duration).toBe(269_000);
    expect(item.spotifyUri).toBe("spotify:track:abc");
  });

  test("accepts open.spotify.com uri as spotify source", () => {
    const stored = { info: { title: "Song", author: "Artist", spotifyUrl: "https://open.spotify.com/track/xyz" } };
    expect(buildSpotifyItemFromTrack(stored)).not.toBeNull();
  });

  test("returns null for non-spotify track", () => {
    const stored = { info: { title: "Song", author: "Artist", uri: "https://youtu.be/abc", spotifyUrl: null } };
    expect(buildSpotifyItemFromTrack(stored)).toBeNull();
  });
});

describe("resolveStoredSpotifyTrack", () => {
  test("re-resolves with verification, skipping cover in first position", async () => {
    const searchFn = vi.fn(async () => ({
      tracks: [
        mk("Lay All Your Love On Me (Cover)", "Cover Artists", 269_000),
        mk("Lay All Your Love On Me", "ABBA - Topic", 269_000),
      ],
    }));
    const stored = { info: { title: "Lay All Your Love On Me", author: "ABBA", duration: 269_000, spotifyUrl: "spotify:track:abc" } };
    const result = await resolveSpotifyTrack({}, buildSpotifyItemFromTrack(stored)!, {}, searchFn);
    expect(result).not.toBeNull();
    expect(result.info.title).toBe("Lay All Your Love On Me");
    expect(result.info.author).toBe("ABBA");
  });

  test("returns null for non-spotify stored track", async () => {
    const stored = { info: { title: "Song", author: "Artist", uri: "https://youtu.be/abc" } };
    const result = await resolveStoredSpotifyTrack({}, stored, {});
    expect(result).toBeNull();
  });

  test("verified resolution wins over unverified first result on karaoke", async () => {
    const searchFn = vi.fn(async () => ({
      tracks: [
        mk("Lay All Your Love On Me (Karaoke Version)", "ABBA - Topic", 269_000),
        mk("Lay All Your Love On Me", "ABBA - Topic", 269_000),
      ],
    }));
    const stored = { info: { title: "Lay All Your Love On Me", author: "ABBA", duration: 269_000, spotifyUrl: "spotify:track:abc" } };
    const result = await resolveSpotifyTrack({}, buildSpotifyItemFromTrack(stored)!, {}, searchFn);
    expect(result).not.toBeNull();
    expect(result.info.title).toBe("Lay All Your Love On Me");
  });
});
