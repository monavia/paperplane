import { describe, expect, test, vi } from "vitest";

vi.mock("../../database/repositories/GuildRepository.js", () => ({
  getVolume: vi.fn(),
  setAutoplay: vi.fn(),
  setLastFilter: vi.fn(),
  setShuffle: vi.fn(),
  setLastEqualizer: vi.fn(),
}));

import { getVolume } from "../../database/repositories/GuildRepository.js";
import { applySavedVolume } from "./PlayerService.js";

describe("applySavedVolume", () => {
  test("sets saved volume on player", async () => {
    (getVolume as any).mockResolvedValue(75);
    const player = { setVolume: vi.fn().mockResolvedValue(undefined) };
    expect(await applySavedVolume("g1", player)).toBe(true);
    expect(player.setVolume).toHaveBeenCalledWith(75);
  });

  test("returns false when no player given", async () => {
    expect(await applySavedVolume("g2", null as any)).toBe(false);
  });

  test("returns false when player lacks setVolume", async () => {
    expect(await applySavedVolume("g3", {} as any)).toBe(false);
  });

  test("returns false when getVolume throws", async () => {
    (getVolume as any).mockRejectedValue(new Error("db down"));
    const player = { setVolume: vi.fn() };
    expect(await applySavedVolume("g4", player)).toBe(false);
  });

  test("returns false when getVolume returns non-finite value", async () => {
    (getVolume as any).mockResolvedValue(null);
    const player = { setVolume: vi.fn() };
    expect(await applySavedVolume("g5", player)).toBe(false);
  });
});
