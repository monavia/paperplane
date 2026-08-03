import { describe, expect, test } from "vitest";
import { hasThai, toLatinCandidates, levenshtein, romanizedApproxEqual, normalizeFullWidth } from "./ScriptUtils.js";

describe("hasThai", () => {
  test("detects Thai script", () => {
    expect(hasThai("ข้างกัน")).toBe(true);
    expect(hasThai("คิด(แต่ไม่)ถึง")).toBe(true);
    expect(hasThai("Three Man Down")).toBe(false);
    expect(hasThai("")).toBe(false);
  });
});

describe("normalizeFullWidth", () => {
  test("converts fullwidth brackets and punctuation", () => {
    expect(normalizeFullWidth("พร「Official Video」")).toBe("พร Official Video");
    expect(normalizeFullWidth("ｈｅｌｌｏ：")).toBe("hello:");
  });
});

describe("toLatinCandidates", () => {
  test("passes through latin strings", () => {
    expect(toLatinCandidates("Three Man Down")).toEqual(["Three Man Down"]);
  });

  test("romanizes Thai strictly and loosely", () => {
    const [strict, loose] = toLatinCandidates("ข้างกัน");
    expect(strict).toBe("khangkan");
    expect(loose).toBe("kangkan");
  });

  test("keeps latin inside mixed titles", () => {
    const c = toLatinCandidates("ข้างกัน (City)");
    expect(c[0]).toContain("khangkan");
    expect(c[0]).toContain("(City)");
  });

  test("two candidate variants when soft differs", () => {
    const c = toLatinCandidates("พระมหา");
    expect(c.length).toBeGreaterThan(1);
    expect(c[0]).toBe("phramha");
  });

  test("RTGS override for known Thai names", () => {
    const c = toLatinCandidates("พระมหาไพรวัลย์");
    expect(c).toContain("phramahaphraiwan");
    expect(c).toContain("pramahaphraiwan");
    expect(c).not.toContain("phramhaaiphrwaly");
  });
});

describe("levenshtein", () => {
  test("basic distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("phra", "pra")).toBe(1);
    expect(levenshtein("pra", "pra")).toBe(0);
  });
});

describe("romanizedApproxEqual", () => {
  test("exact matches", () => {
    expect(romanizedApproxEqual("Pra", "pra")).toBe(true);
  });

  test("one-letter h-drop accepted", () => {
    expect(romanizedApproxEqual("Phra Maha", "Pra Ma Ha")).toBe(true);
  });

  test("short non-contained string rejected", () => {
    expect(romanizedApproxEqual("Phra Maha Prai Wan", "Pra")).toBe(false);
  });

  test("contains-superset accepted for long strings", () => {
    expect(romanizedApproxEqual("Phra Maha Prai Wan", "Phra Maha")).toBe(true);
  });

  test("very different rejected", () => {
    expect(romanizedApproxEqual("Lindsey Stirling", "KANG GUN")).toBe(false);
  });
});