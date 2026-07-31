import { describe, it, assert } from "vitest";
import { isJunkTitle, isJunkTrack, markBadTrack, markGoodTrack, isComboBad, isStrictBoostActive, cooccurCount } from "./RecommendationEngine.js";
import RecommendationEngine from "./RecommendationEngine.js";
import * as EventBus from "../events/EventBus.js";

describe("isJunkTitle", () => {
  it("flags emoji + clickbait + separator title", () => {
    assert.ok(isJunkTitle("LUKA DIATAS LUKA //\u{1F62D} KALAU GAK MAU MENANGIS JANGAN DI PLAY"));
  });

  it("passes legit all-caps official video title", () => {
    assert.ok(!isJunkTitle("DENNY CAKNAN - NEGORO ANGIN (Official Music Video)"));
  });

  it("passes plain title", () => {
    assert.ok(!isJunkTitle("Rampungan"));
  });

  it("flags warning/galau clickbait", () => {
    assert.ok(isJunkTitle("Warning Jangan Nonton Sedih Banget Galau"));
  });
});

describe("isJunkTrack", () => {
  it("flags kembar campursari re-upload with lyric suffix", () => {
    assert.ok(isJunkTrack("Kembar Campursari ( Official Music Video ) Iseh kebayang bayang", "NEGORO ANGIN"));
  });

  it("flags author with official mv marker", () => {
    assert.ok(isJunkTrack("Kawitaning Sinawang | koyo ngene yen nandang loro asmoro", "Campursari (Official MV)"));
  });

  it("flags meme channel author", () => {
    assert.ok(isJunkTrack("DIES NATALIS KE - 16 SMKN 1 BANGSRI (PANAGA XVI)", "SHAUN THE SHEEP"));
  });

  it("flags wedding event video title", () => {
    assert.ok(isJunkTrack("KDK MUSIC - WEDDING TEGUH & MUNA - SENENAN JEPARA", "FEBY PESEK"));
  });

  it("flags happy party video", () => {
    assert.ok(isJunkTrack("LALUNA MUSIC - HAPPY PARTY BROTHEHOOD MAGUAN", "BUNGA PERMATA"));
  });

  it("passes legit caps artist + caps title", () => {
    assert.ok(!isJunkTrack("Widodari", "DENNY CAKNAN"));
  });

  it("passes legit live music video", () => {
    assert.ok(!isJunkTrack("KALAH WETON (Official Live Music)", "DINDA TERATU"));
  });

  it("passes legit title with single pipe tag", () => {
    assert.ok(!isJunkTrack("Crito Mustahil ( Mung ) | #albumkalihwelasku", "Denny Caknan"));
  });
});

describe("markBadTrack", () => {
  it("is idempotent", () => {
    const track = { info: { title: "Wirang", author: "Denny Caknan" } };
    markBadTrack("g1", track);
    markBadTrack("g1", track);
    markBadTrack("g2", track);
  });
});

describe("adaptive weights (layer 2)", () => {
  it("markGoodTrack decays clickbait weight until title stops being junk", () => {
    const title = "Warning Jangan Nonton Sedih Banget Galau";
    assert.ok(isJunkTrack(title));
    for (let i = 0; i < 6; i++) markGoodTrack("g9", { info: { title, author: "Some Artist" } });
    assert.ok(!isJunkTrack(title));
  });

  it("is safe on missing info", () => {
    markGoodTrack("g9", {});
  });
});

describe("_isNearDuplicate (layer 3)", () => {
  it("flags same tokens modulo case/space", () => {
    const eng = new RecommendationEngine();
    assert.ok(eng._isNearDuplicate(
      { info: { title: "KALAH WETON (Official Live Music)", author: "DINDA TERATU" } },
      { info: { title: "Kalah Weton Official Live Music", author: "Dinda Teratu" } },
    ));
  });

  it("passes distinct tracks", () => {
    const eng = new RecommendationEngine();
    assert.ok(!eng._isNearDuplicate(
      { info: { title: "Wirang", author: "Denny Caknan" } },
      { info: { title: "Kalah Weton", author: "Denny Caknan" } },
    ));
  });
});

describe("combo history (layer 4)", () => {
  it("flags combo after 5 bad marks", () => {
    const track = { info: { title: "\u{1F62D} Jangan Nonton", author: "Junk Channel" } };
    for (let i = 0; i < 5; i++) markBadTrack("g10", track);
    assert.ok(isComboBad("g10", track));
  });
});

describe("rapid skip (layer 5)", () => {
  it("activates strict boost after 2 skip-source markBad within window", () => {
    const track = { info: { title: "Sigar", author: "Denny Caknan" } };
    EventBus.emit("recommendation:markBad", { guildId: "g11", track, source: "skip" });
    EventBus.emit("recommendation:markBad", { guildId: "g11", track, source: "skip" });
    assert.ok(isStrictBoostActive("g11"));
  });
});

describe("co-occurrence (layer 6)", () => {
  it("builds edges from consecutive history entries", () => {
    EventBus.emit("history:addEntry", { guildId: "g12", track: { info: { title: "Wirang", author: "Denny Caknan" } } });
    EventBus.emit("history:addEntry", { guildId: "g12", track: { info: { title: "Sigar", author: "Denny Caknan" } } });
    assert.ok(cooccurCount("dennycaknan-wirang", "dennycaknan-sigar") >= 1);
  });
});
