import { describe, it, expect } from "vitest";
import { EQ_PRESETS, PRESET_LIST, resolveEQBands } from "./EQPresets.js";

describe("EQPresets", () => {
  it("has exactly 8 presets", () => {
    expect(Object.keys(EQ_PRESETS).sort()).toEqual(
      ["bass", "classical", "edm", "flat", "jazz", "pop", "rock", "treble"].sort()
    );
  });

  it("each preset has 15 bands (0-14)", () => {
    for (const bands of Object.values(EQ_PRESETS)) {
      expect(bands).toHaveLength(15);
      bands.forEach((b, i) => {
        expect(b.band).toBe(i);
        expect(typeof b.gain).toBe("number");
        expect(b.gain).toBeGreaterThanOrEqual(-0.25);
        expect(b.gain).toBeLessThanOrEqual(1.0);
      });
    }
  });

  it("PRESET_LIST matches EQ_PRESETS keys in order", () => {
    expect(PRESET_LIST.map(p => p.value)).toEqual([
      "flat", "bass", "treble", "rock", "jazz", "pop", "edm", "classical"
    ]);
  });

  describe("resolveEQBands", () => {
    it("returns bands array as-is when passed array", () => {
      const customBands = [{ band: 0, gain: 0.1 }, { band: 1, gain: 0.2 }];
      expect(resolveEQBands(customBands)).toEqual(customBands);
    });

    it("resolves valid preset string to bands", () => {
      const bassBands = resolveEQBands("bass");
      expect(bassBands).toEqual(EQ_PRESETS.bass);
      expect(bassBands).toHaveLength(15);
    });

    it("resolves 'flat' to flat bands", () => {
      const flatBands = resolveEQBands("flat");
      expect(flatBands).not.toBeNull();
      if (flatBands) {
        expect(flatBands).toEqual(EQ_PRESETS.flat);
        flatBands.forEach(b => expect(b.gain).toBe(0.0));
      }
    });

    it("returns null for unknown preset string", () => {
      expect(resolveEQBands("unknown")).toBeNull();
      expect(resolveEQBands("")).toBeNull();
    });

    it("returns null for null/undefined", () => {
      expect(resolveEQBands(null)).toBeNull();
      expect(resolveEQBands(undefined)).toBeNull();
    });

    it("returns null for non-string non-array", () => {
      expect(resolveEQBands(123)).toBeNull();
      expect(resolveEQBands({})).toBeNull();
    });
  });
});