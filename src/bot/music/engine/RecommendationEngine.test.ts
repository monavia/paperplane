import { describe, test, beforeEach } from "vitest";
import assert from "node:assert";
import RecommendationEngine, { isJunkTrack } from "./RecommendationEngine.js";

function mkTrack(title: string, author = "Artist"): any {
  return { info: { title, author } };
}

describe("RecommendationEngine same-track dedupe", () => {
  let engine: RecommendationEngine;

  beforeEach(() => {
    engine = new RecommendationEngine();
  });

  test("suffix variants of the same song are treated as same track", () => {
    assert.ok(engine._isSameTrack(mkTrack("Cyka (Official Video)"), mkTrack("Cyka")));
    assert.ok(engine._isSameTrack(mkTrack("Cyka - Official Audio"), mkTrack("Cyka")));
    assert.ok(engine._isSameTrack(mkTrack("Cyka (Remix)", "A"), mkTrack("Cyka", "A")));
  });

  test("Topic channel author matches the real artist", () => {
    assert.ok(engine._isSameTrack(mkTrack("Cyka", "DJ Blyatman - Topic"), mkTrack("Cyka", "DJ Blyatman, Russian Village Boys")));
  });

  test("different tracks are not conflated", () => {
    assert.ok(!engine._isSameTrack(mkTrack("Cyka"), mkTrack("Other Song")));
  });

  test("variant title still blocks replay via playedTracks", () => {
    engine._markPlayed("g1", mkTrack("Cyka (Official Video)"));
    assert.ok(engine._isPlayed("g1", mkTrack("Cyka")));
  });

  test("clearPlayed actually clears shared state", () => {
    engine._markPlayed("g2", mkTrack("Cyka"));
    new RecommendationEngine().clearPlayed("g2");
    assert.ok(!engine._isPlayed("g2", mkTrack("Cyka")));
  });

  test("non-latin tracks get distinct keys (no collision)", () => {
    engine._markPlayed("g3", mkTrack("밤편지", "아이유"));
    assert.ok(engine._isPlayed("g3", mkTrack("밤편지", "아이유")));
    assert.ok(!engine._isPlayed("g3", mkTrack("밤하늘", "아이유")));
    assert.ok(!engine._isPlayed("g3", mkTrack("밤편지", "폴킴")));
  });

  test("non-latin suffix variants still dedupe", () => {
    assert.ok(engine._isSameTrack(mkTrack("밤편지 (Official Audio)"), mkTrack("밤편지")));
  });
});

describe("history dedupe across author spellings", () => {
  let engine: RecommendationEngine;

  beforeEach(() => {
    engine = new RecommendationEngine();
  });

  test("misspelled latin author with same title is treated as played", () => {
    engine._markPlayed("g10", mkTrack("It's All Right", "北乃きい"));
    assert.ok(engine._isPlayed("g10", mkTrack("It's All Right", "kitnao kii")));
  });

  test("cross-script author with same title is treated as played", () => {
    engine._markPlayed("g11", mkTrack("ヒーター", "Kitano Kii"));
    assert.ok(engine._isPlayed("g11", mkTrack("ヒーター", "北乃きい")));
  });

  test("same title with clearly different CJK authors is not played", () => {
    engine._markPlayed("g12", mkTrack("밤편지", "아이유"));
    assert.ok(!engine._isPlayed("g12", mkTrack("밤편지", "폴킴")));
  });

  test("different titles are not conflated", () => {
    engine._markPlayed("g13", mkTrack("ヒーター", "北乃きい"));
    assert.ok(!engine._isPlayed("g13", mkTrack("サクラサク", "北乃きい")));
  });

  test("variant title with cross-script author still dedupes", () => {
    engine._markPlayed("g14", mkTrack("ヒーター (Official Audio)", "北乃きい"));
    assert.ok(engine._isPlayed("g14", mkTrack("ヒーター", "kitnao kii")));
  });

  test("same identifier blocks even with different titles", () => {
    engine._markPlayed("g15", { info: { title: "One Take", author: "A", identifier: "abc123XYZ99" } });
    assert.ok(engine._isPlayed("g15", { info: { title: "One Take (Live)", author: "A", identifier: "abc123XYZ99" } }));
  });

  test("getRecommendations excludes duplicate variant returned by search", async () => {
    const current = { info: { title: "It's All Right", author: "北乃きい", duration: 200_000, identifier: "abc123XYZ99" } };
    const duplicate = { info: { title: "It's All Right", author: "kitnao kii", duration: 200_000, identifier: "dupVid000001" } };
    const other = { info: { title: "Jumping!", author: "北乃きい", duration: 200_000, identifier: "otherVid00001" } };
    const search = async (query: any) => {
      const q = String(query?.query || "");
      if (q.includes("list=RD")) return { loadType: "playlist", tracks: [] };
      return { loadType: "search", tracks: [duplicate, other] };
    };
    const recs = await engine.getRecommendations({ search }, current, "g16", 3);
    assert.ok(recs.length > 0);
    assert.ok(!recs.some((r: any) => r.info.title === "It's All Right" && r.info.author === "kitnao kii"));
    assert.ok(recs.some((r: any) => r.info.title === "Jumping!"));
  });
});

describe("junk signals (hardJunk/softJunk)", () => {
  test("lyrics reupload is junk", () => {
    assert.ok(isJunkTrack("FLOWER POWER Lyrics (KAN/ROM/ENG)", "Fan Upload"));
  });

  test("editorial + hashtag title is junk", () => {
    assert.ok(isJunkTrack("Facts of Yoon Chan Young you should know | #Allofusaredead", "Pupupapa"));
  });

  test("facts-of alone is junk", () => {
    assert.ok(isJunkTrack("Facts of Yoon Chan Young", "Pupupapa"));
  });

  test("hashtag alone is not junk", () => {
    assert.ok(!isJunkTrack("#Beautiful", "Mariah Carey"));
  });

  test("soft phrases alone are not junk", () => {
    assert.ok(!isJunkTrack("The Story of Us", "Taylor Swift"));
    assert.ok(!isJunkTrack("Story of My Life", "One Direction"));
    assert.ok(!isJunkTrack("How to Save a Life", "The Fray"));
  });

  test("korean lyrics title is junk, plain korean title is not", () => {
    assert.ok(isJunkTrack("밤편지 가사", "아이유"));
    assert.ok(!isJunkTrack("밤편지", "아이유"));
  });

  test("multilingual editorial junk is caught (KR/CN/JP/AR/TH)", () => {
    assert.ok(isJunkTrack("아이유 뉴스 모음", "채널"));
    assert.ok(isJunkTrack("某歌曲背后的故事", "频道"));
    assert.ok(isJunkTrack("あの曲のまとめ", "チャンネル"));
    assert.ok(isJunkTrack("أخبار الفنان", "قناة"));
    assert.ok(isJunkTrack("เรื่องราวของเพลงนี้", "ช่อง"));
  });

  test("unicode hashtag tiers: lyrics tag junk, plain tag not", () => {
    assert.ok(isJunkTrack("#كلمات", "فنان"));
    assert.ok(!isJunkTrack("#أغنية", "فنان"));
  });

  test("non-latin style variants are soft junk (not hard-blocked)", () => {
    assert.ok(!isJunkTrack("밤편지 커버", "누군가"));
    assert.ok(!isJunkTrack("中文翻唱", "某人"));
  });
});
