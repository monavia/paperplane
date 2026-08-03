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

  test("thai official video with verbose artist+feat title resolves (B containment)", () => {
    const track = mk("Three Man Down - ข้างกัน (City) Feat.ออม TELEx TELEXs「Official Video」", "Three Man Down - Topic", 296_000);
    const item = mkSpotify("ข้างกัน (City)", ["Three Man Down", "ออม TELExTELEXs"], 296_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("thai title with romanized feat artist resolves", () => {
    const track = mk("อีกไม่นาน นานแค่ไหน (feat. Phra Maha)", "getsunova", 192_000);
    const item = mkSpotify("อีกไม่นาน นานแค่ไหน", ["getsunova", "Three Man Down", "พระมหา"], 192_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("thai multiword romanized feat credit resolves via RTGS override", () => {
    const track = mk("อีกไม่นาน นานแค่ไหน (feat. Pra Ma Ha Prai Wan)", "getsunova", 192_000);
    const item = mkSpotify("อีกไม่นาน นานแค่ไหน", ["getsunova", "Three Man Down", "พระมหาไพรวัลย์"], 192_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("thai feat credit with unknown romanized words still rejected", () => {
    const track = mk("อีกไม่นาน นานแค่ไหน (feat. Pra Me Ha Zzz)", "getsunova", 192_000);
    const item = mkSpotify("อีกไม่นาน นานแค่ไหน", ["getsunova", "Three Man Down", "พระมหาไพรวัลย์"], 192_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
  });

  test("thai romanized title without any matchable script still rejected", () => {
    const track = mk("KHANG GUN (CITY)", "KANG GUN - Topic", 296_000);
    const item = mkSpotify("ข้างกัน (City)", ["Three Man Down"], 296_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
  });

  test("unrelated thai words still rejected (not a script-match pass)", () => {
    const track = mk("Twtaen (Live) Lo Giangan", "Some Artist", 300_000);
    const item = mkSpotify("ข้างกัน (City)", ["Three Man Down"], 296_000);
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

  test("feat host in yt title passes when the feat artist is on the spotify item", () => {
    const track = mk("Warbringer (feat. Lindsey Stirling)", "TheFatRat", 219_000);
    const item = mkSpotify("Warbringer", ["TheFatRat", "Everen Maxwell", "Lindsey Stirling"], 219_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("unknown feat artist in yt title still rejected", () => {
    const track = mk("Beautiful Times (feat. 5ok Lil Austin)", "Lena Tere", 288_000);
    const item = mkSpotify("Beautiful Times", ["Owl City", "Lindsey Stirling"], 206_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
  });

  test("yt author naming a secondary spotify artist passes", () => {
    const track = mk("Main Theme (From \"The Dark Knight Rises\")", "Lindsey Stirling", 262_000);
    const item = mkSpotify("Main Theme (From \"The Dark Knight Rises\")", ["Hans Zimmer", "Lindsey Stirling", "Gavin Greenaway", "The Czech Philharmonic Orchestra"], 262_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("paren variant title matches dash variant spot title", () => {
    const track = mk("All of Me (Violin Remix)", "John Legend", 279_000);
    const item = mkSpotify("All of Me - Violin Remix", ["John Legend", "Lindsey Stirling"], 281_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("feat artist inside spotify title with single-artist author passes", () => {
    const track = mk("Shatter Me", "Lindsey Stirling - Topic", 247_000);
    const item = mkSpotify("Shatter Me Featuring Lzzy Hale", ["Lindsey Stirling"], 247_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("collab title carrying the feat in both sides passes", () => {
    const track = mk("The Show Must Go On (feat. Adam Lambert)", "Queen - Topic", 168_000);
    const item = mkSpotify("The Show Must Go On - Featuring Adam Lambert", ["Queen"], 168_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("spotify title feat artist trusted even when not in artists array", () => {
    const track = mk("Survive", "Kenziner", 210_000);
    const item = mkSpotify("Survive (Featuring Webhelp)", ["Kenziner"], 210_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("yt-introduced unknown feat artist still rejected despite spot title feat", () => {
    const track = mk("Survive (feat. 5ok Temple)", "Kenziner", 210_000);
    const item = mkSpotify("Survive (Featuring Webhelp)", ["Kenziner"], 210_000);
    expect(verifySpotifyMatch(item, track)).toBe(false);
  });

  test("camelCase author tokenizes across the boundary", () => {
    const track = mk("Something Wild", "AndrewWild", 180_000);
    const item = mkSpotify("Something Wild", ["Andrew Wild"], 180_000);
    expect(verifySpotifyMatch(item, track)).toBe(true);
  });

  test("camelCase title tokenizes across the boundary", () => {
    const track = mk("Dying For You", "AndrewWild", 205_000);
    const item = mkSpotify("DyingForYou", ["Andrew Wild"], 205_000);
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

  test("session-noise title gains clean fallback variants", () => {
    const item = mkSpotify("7 Years (Acoustic) - Recorded at Spotify Studios Nyc", ["Lindsey Stirling"], 252_000);
    const v = buildQueryVariants(item);
    expect(v).toContain("7 Years");
    expect(v).toContain("Lindsey Stirling 7 Years");
  });

  test("multi-artist adds primary-artist clean variant", () => {
    const item = mkSpotify("Heavy Weight", ["Lindsey Stirling", "Beat Saber"], 190_000);
    const v = buildQueryVariants(item);
    expect(v).toContain("Lindsey Stirling Heavy Weight");
  });

  test("clean variant unchanged when title has no noise", () => {
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"]);
    expect(buildQueryVariants(item)).toEqual(["Ada Band Manusia Bodoh", "Manusia Bodoh", "Manusia Bodoh Ada Band"]);
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
    expect(searchFn).toHaveBeenCalledTimes(6);
  });

  test("falls back to Deezer when YouTube has no strict match", async () => {
    const searchFn = vi.fn(async (_p: any, qo: any) => {
      if (qo.query.startsWith("ytmsearch:") || qo.query.startsWith("ytsearch:")) {
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

  test("ytsearch fallback resolves a track ytmsearch missed", async () => {
    const searchFn = vi.fn(async (_p: any, qo: any) => {
      if (qo.query.startsWith("ytmsearch:")) {
        return { tracks: [mk("Heavy Weight", "Current Value", 286_000)] };
      }
      if (qo.query.startsWith("ytsearch:")) {
        return { tracks: [mk("Heavy Weight", "Lindsey Stirling - Topic", 190_000)] };
      }
      return { tracks: [] };
    });
    const item = mkSpotify("Heavy Weight", ["Lindsey Stirling", "Beat Saber"], 190_000);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).not.toBeNull();
    expect(result.info.author).toBe("Lindsey Stirling, Beat Saber");
    expect(result.info.spotifyUrl).toBe(item.spotifyUri);
    expect(searchFn.mock.calls.some((c: any) => c[1].query.startsWith("ytsearch:"))).toBe(true);
  });

  test("ytsearch fallback still enforces strict match (no best-effort)", async () => {
    const searchFn = vi.fn(async (_p: any, qo: any) => {
      if (qo.query.startsWith("ytsearch:")) {
        return { tracks: [mk("Heavy Weight (Instrumental)", "Current Value", 286_000)] };
      }
      return { tracks: [mk("Heavy Weight", "Current Value", 286_000)] };
    });
    const item = mkSpotify("Heavy Weight", ["Lindsey Stirling", "Beat Saber"], 190_000);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).toBeNull();
  });

  test("skips when Deezer fallback also fails strict verification", async () => {
    const searchFn = vi.fn(async () => ({ tracks: [mk("If Walls Could Talk", "If Walls Could Talk", 183_000)] }));
    const item = mkSpotify("If Walls Could Talk", ["Halsey"], 183_000);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).toBeNull();
  });

  test("uses primary artist only for Deezer fallback on duet tracks", async () => {
    const searchFn = vi.fn(async (_p: any, qo: any) => {
      if (qo.query.startsWith("ytmsearch:") || qo.query.startsWith("ytsearch:")) return { tracks: [mk("Lose You Now", "Wrong Artist", 236_000)] };
      return { tracks: [mk("Lose You Now", "Lindsey Stirling", 236_000)] };
    });
    const item = mkSpotify("Lose You Now", ["Lindsey Stirling", "Mako"], 236_000);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).not.toBeNull();
    expect(searchFn.mock.calls[searchFn.mock.calls.length - 1][1].query).toBe("dzsearch:Lindsey Stirling Lose You Now");
  });

  test("duet passes when YouTube returns only the primary author (scraper-split artists)", async () => {
    const searchFn = vi.fn(async (_p: any, qo: any) => ({ tracks: [mk("Lose You Now", "Lindsey Stirling - Topic", 236_000)] }));
    const item = mkSpotify("Lose You Now", ["Lindsey Stirling", "Mako"], 236_000);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).not.toBeNull();
    expect(result.info.title).toBe("Lose You Now");
    expect(result.info.author).toBe("Lindsey Stirling, Mako");
    expect(searchFn.mock.calls[0][1].query).toBe("ytmsearch:Lindsey Stirling Mako Lose You Now");
    expect(searchFn).toHaveBeenCalledTimes(1);
  });

  test("skips Deezer fallback when node lacks the deezer source", async () => {
    const searchFn = vi.fn(async () => ({ tracks: [mk("Lose You Now", "Wrong Artist", 236_000)] }));
    const item = mkSpotify("Lose You Now", ["Lindsey Stirling", "Mako"], 236_000);
    const player = { node: { id: "n1", info: { sourceManagers: ["youtube"] } } };
    const result = await resolveSpotifyTrack(player, item, {}, searchFn);
    expect(result).toBeNull();
    expect(searchFn.mock.calls.every((c: any) => !/dzsearch:/.test(c[1].query))).toBe(true);
  });

  test("still attempts Deezer fallback when node info is unknown", async () => {
    const searchFn = vi.fn(async (_p: any, qo: any) => {
      if (qo.query.startsWith("ytmsearch:") || qo.query.startsWith("ytsearch:")) {
        return { tracks: [mk("If Walls Could Talk", "Wrong", 183_000)] };
      }
      return { tracks: [mk("If Walls Could Talk", "Halsey", 183_000)] };
    });
    const item = mkSpotify("If Walls Could Talk", ["Halsey"], 183_000);
    const player = { node: { id: "n1", info: null } };
    const result = await resolveSpotifyTrack(player, item, {}, searchFn);
    expect(result).not.toBeNull();
    expect(searchFn.mock.calls.some((c: any) => /dzsearch:/.test(c[1].query))).toBe(true);
  });

  test("iterates candidates in order, skipping covers until the official matches", async () => {
    const searchFn = vi.fn(async () => ({
      tracks: [
        mk("Long Way Home (8-Bit Walk off the Earth & Lindsey Stirling Emulation)", "8-Bit Arcade", 151_000),
        mk("Long Way Home (Instrumental)", "Walk Off the Earth", 158_000),
        mk("Long Way Home", "Walk Off The Earth", 158_000),
      ],
    }));
    const item = mkSpotify("Long Way Home", ["Walk off the Earth", "Lindsey Stirling"], 158_000);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).not.toBeNull();
    expect(result.info.title).toBe("Long Way Home");
  });

  test("returns null when no tracks at all", async () => {
    const searchFn = vi.fn(async () => ({ tracks: [] }));
    const item = mkSpotify("Manusia Bodoh", ["Ada Band"]);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).toBeNull();
  });

  test("resolves via primary-artist clean variant on noisy multi-artist title", async () => {
    const searchFn = vi.fn(async (_p: any, qo: any) => {
      const q = qo.query;
      if (q === "ytmsearch:Lindsey Stirling Heavy Weight") {
        return { tracks: [mk("Heavy Weight", "Lindsey Stirling - Topic", 190_000)] };
      }
      if (q === "ytmsearch:Lindsey Stirling Beat Saber Heavy Weight") {
        return { tracks: [mk("Some Other Title", "Lindsey Stirling - Topic", 190_000)] };
      }
      return { tracks: [mk("Heavy Weight", "Chathuwa", 190_000)] };
    });
    const item = mkSpotify("Heavy Weight", ["Lindsey Stirling", "Beat Saber"], 190_000);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).not.toBeNull();
    expect(result.info.author).toBe("Lindsey Stirling, Beat Saber");
    expect(searchFn.mock.calls.some((c: any) => c[1].query === "ytmsearch:Lindsey Stirling Heavy Weight")).toBe(true);
  });

  test("resolves via stripped-title clean variant on session-noise track", async () => {
    const searchFn = vi.fn(async (_p: any, qo: any) => {
      const q = qo.query;
      if (q.includes("Recorded at Spotify")) {
        return { tracks: [mk("7 Years (Acoustic)", "Onyra", 232_000)] };
      }
      if (q === "ytmsearch:Lindsey Stirling 7 Years") {
        return { tracks: [mk("7 Years (Acoustic)", "Lindsey Stirling - Topic", 232_000)] };
      }
      return { tracks: [] };
    });
    const item = mkSpotify("7 Years (Acoustic) - Recorded at Spotify Studios Nyc", ["Lindsey Stirling"], 232_000);
    const result = await resolveSpotifyTrack({}, item, {}, searchFn);
    expect(result).not.toBeNull();
    expect(result.info.author).toBe("Lindsey Stirling");
    expect(searchFn.mock.calls.some((c: any) => c[1].query === "ytmsearch:Lindsey Stirling 7 Years")).toBe(true);
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
