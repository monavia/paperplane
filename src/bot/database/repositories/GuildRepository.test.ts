import { describe, expect, test, vi } from "vitest";

vi.mock("../models/Guild.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../connection.js", () => ({ isUsingPrisma: () => false }));
vi.mock("../../core/utils/Logger.js", () => ({ default: { warn: vi.fn() } }));

import Guild from "../models/Guild.js";
import { getVolume } from "./GuildRepository.js";

function mockFindOne(result: any) {
  (Guild.findOne as any).mockReturnValue({ lean: vi.fn().mockResolvedValue(result) });
}

describe("getVolume", () => {
  test("returns stored volume", async () => {
    mockFindOne({ volume: 60 });
    expect(await getVolume("g1")).toBe(60);
  });

  test("falls back to 100 when guild not saved", async () => {
    mockFindOne(null);
    expect(await getVolume("g2")).toBe(100);
  });

  test("falls back to 100 on error", async () => {
    (Guild.findOne as any).mockRejectedValue(new Error("db down"));
    expect(await getVolume("g3")).toBe(100);
  });
});
