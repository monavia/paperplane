import { describe, test, vi, beforeEach } from "vitest";
import assert from "node:assert";

const mockQueueGet = vi.fn();
const mockNowPlaying = vi.fn();
const mockQueueSet = vi.fn();
vi.mock("../../core/state/StateManager.js", () => ({
  default: {
    queues: { get: mockQueueGet, set: mockQueueSet },
    nowPlaying: { get: mockNowPlaying },
  },
}));

vi.mock("../../core/utils/Logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockWithQueueLock = vi.fn((_g: string, fn: any) => fn());
vi.mock("../../core/state/QueueLock.js", () => ({
  withQueueLock: mockWithQueueLock,
}));

vi.mock("./StateService.js", () => ({
  saveState: vi.fn(),
}));

vi.mock("./PlayerService.js", () => ({
  getEngine: vi.fn(() => ({ player: null })),
}));

vi.mock("../engine/lavalink.js", () => ({
  get: vi.fn(() => null),
}));

describe("PlaylistService", () => {
  let mod: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mod = await import("./PlaylistService.js");
  });

  describe("exportPlaylist", () => {
    test("returns null when queue empty and nothing playing", () => {
      mockQueueGet.mockReturnValue([]);
      mockNowPlaying.mockReturnValue(null);
      assert.strictEqual(mod.exportPlaylist("g1"), null);
    });

    test("returns tracks from queue", () => {
      mockQueueGet.mockReturnValue([
        { info: { title: "T1", author: "A1", uri: "https://example.com/1", duration: 200000, sourceName: "youtube" } },
        { info: { title: "T2", author: "A2", uri: "https://example.com/2", duration: 150000, sourceName: "youtube" } },
      ]);
      mockNowPlaying.mockReturnValue(null);
      const r = mod.exportPlaylist("g1");
      assert.strictEqual(r.tracks.length, 2);
      assert.strictEqual(r.tracks[0].title, "T1");
      assert.strictEqual(r.current, null);
    });

    test("includes nowPlaying as current", () => {
      mockQueueGet.mockReturnValue([]);
      mockNowPlaying.mockReturnValue({ info: { title: "Now", author: "Ar", uri: "https://example.com/n", duration: 300000, sourceName: "spotify" } });
      const r = mod.exportPlaylist("g1");
      assert.strictEqual(r.current.title, "Now");
      assert.strictEqual(r.current.sourceName, "spotify");
    });

    test("handles missing info fields", () => {
      mockQueueGet.mockReturnValue([{ info: {} }]);
      mockNowPlaying.mockReturnValue(null);
      const r = mod.exportPlaylist("g1");
      assert.strictEqual(r.tracks[0].title, "Unknown");
      assert.strictEqual(r.tracks[0].author, "");
    });
  });

  describe("savePlaylist", () => {
    test("saves playlist from current queue", () => {
      mockQueueGet.mockReturnValue([{ info: { title: "T1", author: "A1", duration: 100000 } }]);
      mockNowPlaying.mockReturnValue(null);
      const r = mod.savePlaylist("user1", "g1", "My List");
      assert.ok(r);
      assert.strictEqual(r.tracks.length, 1);
      assert.strictEqual(r.name, "My List");
    });

    test("returns null when queue empty", () => {
      mockQueueGet.mockReturnValue([]);
      mockNowPlaying.mockReturnValue(null);
      assert.strictEqual(mod.savePlaylist("user1", "g1", "Empty"), null);
    });
  });

  describe("listPlaylists", () => {
    test("returns empty list for new user", () => {
      mockQueueGet.mockReturnValue([]);
      mockNowPlaying.mockReturnValue(null);
      assert.strictEqual(mod.listPlaylists("newuser").length, 0);
    });

    test("lists saved playlists", () => {
      mockQueueGet.mockReturnValue([{ info: { title: "T1", author: "A1", duration: 100000 } }]);
      mockNowPlaying.mockReturnValue(null);
      mod.savePlaylist("user2", "g1", "List A");
      mod.savePlaylist("user2", "g1", "List B");
      const list = mod.listPlaylists("user2");
      assert.strictEqual(list.length, 2);
    });

    test("isolates playlists per user", () => {
      mockQueueGet.mockReturnValue([{ info: { title: "T", author: "A", duration: 100000 } }]);
      mockNowPlaying.mockReturnValue(null);
      mod.savePlaylist("userA", "g1", "A's List");
      assert.strictEqual(mod.listPlaylists("userB").length, 0);
      assert.strictEqual(mod.listPlaylists("userA").length, 1);
    });
  });

  describe("getPlaylist", () => {
    test("returns null for unknown playlist", () => {
      assert.strictEqual(mod.getPlaylist("user1", "nonexistent"), null);
    });

    test("returns saved playlist by name (case-insensitive)", () => {
      mockQueueGet.mockReturnValue([{ info: { title: "T1", author: "A1", duration: 100000 } }]);
      mockNowPlaying.mockReturnValue(null);
      mod.savePlaylist("user1", "g1", "My Mix");
      const r = mod.getPlaylist("user1", "my mix");
      assert.ok(r);
      assert.strictEqual(r.tracks.length, 1);
    });
  });

  describe("deletePlaylist", () => {
    test("returns false for unknown", () => {
      assert.ok(!mod.deletePlaylist("user1", "ghost"));
    });

    test("deletes existing playlist", () => {
      mockQueueGet.mockReturnValue([{ info: { title: "T", author: "A", duration: 100000 } }]);
      mockNowPlaying.mockReturnValue(null);
      mod.savePlaylist("user1", "g1", "Delete Me");
      assert.ok(mod.deletePlaylist("user1", "Delete Me"));
      assert.strictEqual(mod.getPlaylist("user1", "Delete Me"), null);
    });
  });

  describe("importPlaylist", () => {
    test("returns 0 when no Lavalink player", async () => {
      const count = await mod.importPlaylist("g1", [{ title: "T", author: "A", uri: null, identifier: null, duration: 0, sourceName: "youtube" }], "user1");
      assert.strictEqual(count, 0);
    });
  });
});
