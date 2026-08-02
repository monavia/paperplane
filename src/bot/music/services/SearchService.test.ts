import { describe, test } from "vitest";
import assert from "node:assert";
import { pickBestTrack, isInDurationRange } from "./SearchService.js";

function mk(title: string, author: string): any {
  return { info: { title, author, sourceName: "youtube" } };
}

describe("pickBestTrack", () => {
  const tracks = [
    mk("Cyka", "Russian Village Boys x Cosmo & Skoro"),
    mk("Cyka Blyat", "DJ Blyatman"),
  ];

  test("reranks by query keywords (artist + title)", () => {
    const best = pickBestTrack(tracks, "blyatman cyka blyat");
    assert.strictEqual(best.info.title, "Cyka Blyat");
  });

  test("prefers full keyword match over single", () => {
    const best = pickBestTrack(tracks, "cyka blyat");
    assert.strictEqual(best.info.title, "Cyka Blyat");
  });

  test("keeps legacy tracks[0] behavior without query", () => {
    assert.strictEqual(pickBestTrack(tracks).info.title, "Cyka");
  });

  test("trusts YTM order when top result is non-latin but query is latin (script mismatch)", () => {
    const cjk = [
      { info: { title: "葉桜", author: "北乃きい", sourceName: "youtube", length: 318_000 } },
      { info: { title: "Hazakura", author: "Deebu", sourceName: "youtube", length: 153_000 } },
    ];
    const best = pickBestTrack(cjk, "kie kitano hazakura");
    assert.strictEqual(best.info.title, "葉桜");
  });

  test("trusts YTM order for single latin keyword vs non-latin top result", () => {
    const list = [
      { info: { title: "葉桜", author: "北乃きい", sourceName: "youtube", length: 318_000 } },
      { info: { title: "Hazakura", author: "Deebu", sourceName: "youtube", length: 153_000 } },
    ];
    const best = pickBestTrack(list, "hazakura");
    assert.strictEqual(best.info.title, "葉桜");
  });

  test("still reranks when top result contains latin text", () => {
    const t = [
      mk("Never Cry", "kitano kii"),
      mk("Hazakura", "kitano kii"),
    ];
    const best = pickBestTrack(t, "kitano kii hazakura");
    assert.strictEqual(best.info.title, "Hazakura");
  });

  test("ignores keyword scoring for URLs", () => {
    const best = pickBestTrack(tracks, "https://www.youtube.com/watch?v=zy97UHdoQKk");
    assert.strictEqual(best.info.title, "Cyka");
  });

  test("does not filter tracks whose artist contains 'dj'", () => {
    const withDj = [
      mk("CYKA BLYAT (Official Music Video)", "DJ Blyatman"),
      mk("CYKA BLYAT", "BIAŁAS & LANEK"),
    ];
    const best = pickBestTrack(withDj, "cyka blyat");
    assert.strictEqual(best.info.author, "DJ Blyatman");
  });

  test("filters tracks shorter than 2 minutes when alternatives exist", () => {
    const short = { info: { title: "S Meme - CYKA BLYAT edition", author: "S Meme", sourceName: "youtube", length: 9_000 } };
    const normal = { info: { title: "CYKA BLYAT (Official Music Video)", author: "DJ Blyatman", sourceName: "youtube", length: 183_000 } };
    const best = pickBestTrack([short, normal], "cyka blyat");
    assert.strictEqual(best.info.author, "DJ Blyatman");
  });

  test("filters tracks longer than 8 minutes when alternatives exist", () => {
    const long = { info: { title: "Full Mix 1 hour", author: "S Meme", sourceName: "youtube", length: 600_000 } };
    const normal = { info: { title: "CYKA BLYAT (Official Music Video)", author: "DJ Blyatman", sourceName: "youtube", length: 183_000 } };
    const best = pickBestTrack([long, normal], "cyka blyat");
    assert.strictEqual(best.info.author, "DJ Blyatman");
  });

  test("falls back to original results when all tracks are out of range", () => {
    const short = { info: { title: "Shorty", author: "A", sourceName: "youtube", length: 5_000 } };
    const best = pickBestTrack([short], "shorty");
    assert.strictEqual(best.info.title, "Shorty");
  });

  test("does not apply duration filter for URL queries", () => {
    const long = { info: { title: "Long Mix", author: "B", sourceName: "youtube", length: 900_000 } };
    const best = pickBestTrack([long], "https://www.youtube.com/watch?v=zy97UHdoQKk");
    assert.strictEqual(best.info.title, "Long Mix");
  });
});

describe("pickBestTrack junk handling", () => {
  test("official audio beats lyrics reupload", () => {
    const tracks = [
      mk("FLOWER POWER Lyrics (KAN/ROM/ENG)", "Fan Upload"),
      mk("FLOWER POWER (Official Music Video)", "Girls' Generation"),
    ];
    const best = pickBestTrack(tracks, "flower power");
    assert.strictEqual(best.info.author, "Girls' Generation");
  });

  test("editorial + hashtag junk loses to normal result", () => {
    const tracks = [
      mk("Facts of Yoon Chan Young you should know | #Allofusaredead", "Pupupapa"),
      mk("All of Us Are Dead OST", "Artist X"),
    ];
    const best = pickBestTrack(tracks, "all of us are dead");
    assert.strictEqual(best.info.author, "Artist X");
  });

  test("lyrics-only result still playable", () => {
    const tracks = [
      mk("FLOWER POWER Lyrics (KAN/ROM/ENG)", "Fan Upload"),
    ];
    const best = pickBestTrack(tracks, "flower power");
    assert.ok(best.info.title.toLowerCase().includes("lyrics"));
  });

  test("korean official beats korean lyrics reupload", () => {
    const tracks = [
      mk("밤편지 (가사)", "커버 채널"),
      mk("밤편지 (Official Audio)", "아이유"),
    ];
    const best = pickBestTrack(tracks, "밤편지");
    assert.strictEqual(best.info.author, "아이유");
  });

  test("non-latin query produces keywords (no -8 penalty on all)", () => {
    const tracks = [
      mk("เพลงอื่น", "นักร้อง"),
      mk("เพลงรัก", "นักร้อง"),
    ];
    const best = pickBestTrack(tracks, "เพลงรัก");
    assert.strictEqual(best.info.title, "เพลงรัก");
  });

  test("multilingual style variant loses to official", () => {
    const tracks = [
      mk("밤편지 리믹스", "DJ"),
      mk("밤편지", "아이유"),
    ];
    const best = pickBestTrack(tracks, "밤편지");
    assert.strictEqual(best.info.author, "아이유");
  });
});

describe("isInDurationRange", () => {
  test("reads info.duration (lavalink TrackInfo) as well", () => {
    assert.ok(!isInDurationRange({ info: { duration: 9_000 } }));
    assert.ok(isInDurationRange({ info: { duration: 183_000 } }));
    assert.ok(!isInDurationRange({ info: { duration: 600_000 } }));
  });

  test("unknown duration passes", () => {
    assert.ok(isInDurationRange({ info: {} }));
  });
});

describe("pickBestTrack live handling", () => {
  test("live concert version loses to studio version despite full keyword match", () => {
    const tracks = [
      mk("Manusia Bodoh", "Ada Band"),
      mk("Ada Band - Manusia Bodoh (Live at Konser 2015)", "Ada Band"),
    ];
    const best = pickBestTrack(tracks, "ada band manusia bodoh");
    assert.strictEqual(best.info.title, "Manusia Bodoh");
  });

  test("thai live concert version loses to studio version", () => {
    const tracks = [
      { info: { title: "คิด(แต่ไม่)ถึง คอนเสิร์ต", author: "Same Page", sourceName: "youtube" } },
      { info: { title: "คิด(แต่ไม่)ถึง", author: "Same Page", sourceName: "youtube" } },
    ];
    const best = pickBestTrack(tracks, "same page คิด(แต่ไม่)ถึง");
    assert.strictEqual(best.info.title, "คิด(แต่ไม่)ถึง");
  });

  test("script-mismatch trust skipped when top result is live", () => {
    const tracks = [
      { info: { title: "คิด(แต่ไม่)ถึง คอนเสิร์ต", author: "เสมเพจ", sourceName: "youtube" } },
      { info: { title: "คิด(แต่ไม่)ถึง", author: "เสมเพจ", sourceName: "youtube" } },
    ];
    const best = pickBestTrack(tracks, "same page คิด(แต่ไม่)ถึง");
    assert.strictEqual(best.info.title, "คิด(แต่ไม่)ถึง");
  });

  test("live-only result still playable", () => {
    const tracks = [mk("Manusia Bodoh (Live at Konser 2015)", "Ada Band")];
    const best = pickBestTrack(tracks, "ada band manusia bodoh");
    assert.ok(best.info.title.toLowerCase().includes("live"));
  });
});
