import { describe, it, assert } from "vitest";
import { isJunkTitle, isJunkTrack, markBadTrack } from "./RecommendationEngine.js";

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
