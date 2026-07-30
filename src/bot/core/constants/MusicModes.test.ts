import { describe, test } from "vitest";
import assert from "node:assert";
import MusicModes from "./MusicModes.js";

describe("MusicModes", () => {
  describe("LOOP", () => {
    test("has NONE", () => assert.strictEqual(MusicModes.LOOP.NONE, "none"));
    test("has TRACK", () => assert.strictEqual(MusicModes.LOOP.TRACK, "track"));
    test("has QUEUE", () => assert.strictEqual(MusicModes.LOOP.QUEUE, "queue"));
  });

  describe("AUTOPLAY", () => {
    test("has OFF", () => assert.strictEqual(MusicModes.AUTOPLAY.OFF, "off"));
    test("has RECOMMENDATIONS", () => assert.strictEqual(MusicModes.AUTOPLAY.RECOMMENDATIONS, "recommendations"));
    test("has SIMILAR", () => assert.strictEqual(MusicModes.AUTOPLAY.SIMILAR, "similar"));
  });

  describe("FILTERS", () => {
    test("has NONE", () => assert.strictEqual(MusicModes.FILTERS.NONE, "none"));
    test("has BASSBOOST", () => assert.strictEqual(MusicModes.FILTERS.BASSBOOST, "bassboost"));
    test("has NIGHT_CORE", () => assert.strictEqual(MusicModes.FILTERS.NIGHT_CORE, "nightcore"));
    test("has VAPORWAVE", () => assert.strictEqual(MusicModes.FILTERS.VAPORWAVE, "vaporwave"));
    test("has EIGHT_D", () => assert.strictEqual(MusicModes.FILTERS.EIGHT_D, "8d"));
    test("has SLOWMO", () => assert.strictEqual(MusicModes.FILTERS.SLOWMO, "slowmo"));
    test("has SOFT", () => assert.strictEqual(MusicModes.FILTERS.SOFT, "soft"));
    test("has TREBLE", () => assert.strictEqual(MusicModes.FILTERS.TREBLE, "treble"));
    test("has all 8 filters", () => {
      assert.strictEqual(Object.keys(MusicModes.FILTERS).length, 8);
    });
  });

  test("structure is correct", () => {
    assert.ok(MusicModes.LOOP);
    assert.ok(MusicModes.AUTOPLAY);
    assert.ok(MusicModes.FILTERS);
    assert.strictEqual(typeof MusicModes, "object");
  });
});
