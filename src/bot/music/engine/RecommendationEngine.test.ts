import { describe, it, assert } from "vitest";
import { isJunkTitle } from "./RecommendationEngine.js";

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
