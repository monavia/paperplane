import { describe, test, vi, beforeEach } from "vitest";
import assert from "node:assert";

vi.mock("../../core/utils/Logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("FavoritesService", () => {
  let mod: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mod = await import("./FavoritesService.js");
    mod._clearForTest();
  });

  const track1 = { title: "Song A", author: "Artist A", uri: "https://a.com", identifier: "id-a", duration: 200000, sourceName: "youtube" };
  const track2 = { title: "Song B", author: "Artist B", uri: "https://b.com", identifier: "id-b", duration: 150000, sourceName: "spotify" };

  test("addFavorite returns ok for new track", () => {
    const r = mod.addFavorite("u1", track1);
    assert.ok(r.ok);
    assert.strictEqual(r.total, 1);
  });

  test("addFavorite rejects duplicates by identifier", () => {
    mod.addFavorite("u1", track1);
    const r = mod.addFavorite("u1", track1);
    assert.ok(!r.ok);
  });

  test("listFavorites returns empty for new user", () => {
    assert.strictEqual(mod.listFavorites("unknown").length, 0);
  });

  test("listFavorites returns saved tracks", () => {
    mod.addFavorite("u1", track1);
    mod.addFavorite("u1", track2);
    const list = mod.listFavorites("u1");
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].track.title, "Song A");
  });

  test("favorites isolated per user", () => {
    mod.addFavorite("u1", track1);
    assert.strictEqual(mod.listFavorites("u2").length, 0);
    assert.strictEqual(mod.listFavorites("u1").length, 1);
  });

  test("removeFavorite returns false for unknown", () => {
    assert.ok(!mod.removeFavorite("u1", "nonexistent"));
  });

  test("removeFavorite by identifier", () => {
    mod.addFavorite("u1", track1);
    assert.ok(mod.removeFavorite("u1", "id-a"));
    assert.strictEqual(mod.listFavorites("u1").length, 0);
  });

  test("removeFavorite by title", () => {
    mod.addFavorite("u1", track1);
    assert.ok(mod.removeFavorite("u1", "Song A"));
    assert.strictEqual(mod.listFavorites("u1").length, 0);
  });

  test("getFavoriteCount", () => {
    assert.strictEqual(mod.getFavoriteCount("u1"), 0);
    mod.addFavorite("u1", track1);
    assert.strictEqual(mod.getFavoriteCount("u1"), 1);
  });
});
