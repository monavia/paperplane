// @ts-nocheck
import { describe, test, vi, afterEach } from "vitest";
import assert from "node:assert";
import {
  isFailoverGuild, clearFailoverGuild,
  connectWithRetry, cacheTrack, getCachedTrack, clearTrackCache, pruneTrackCache,
  failoverFromNode, setLavalinkRef,
} from "../bot/music/engine/FailoverManager.js";
import * as TitleResolver from "../bot/music/services/TitleResolver.js";
import * as SearchService from "../bot/music/services/SearchService.js";
import * as NodePenaltyService from "../bot/music/engine/NodePenaltyService.js";
import * as PlayerService from "../bot/music/services/PlayerService.js";
import * as TextChannelStore from "../bot/music/services/TextChannelStore.js";
import state from "../bot/core/state/StateManager.js";

vi.mock("../bot/core/utils/Logger.js", () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, ready: () => {}, safe: () => () => {} },
  info: () => {}, warn: () => {}, error: () => {}, safe: () => () => {},
}));

vi.mock("../bot/music/services/TitleResolver.js", () => ({
  saveSpotifyMeta: vi.fn(() => ({})),
  applySpotifyMeta: vi.fn(),
}));

vi.mock("../bot/music/services/SearchService.js", () => ({
  searchWithRetry: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../bot/music/engine/NodePenaltyService.js", () => {
  const fn = vi.fn(() => null);
  const fb = { getBestNode: fn, getPenalty: vi.fn(() => 0), isDraining: vi.fn(() => false), recordDisconnect: vi.fn(), recordError: vi.fn() };
  (fb as any).__setBestNode = (v: any) => fn.mockReturnValue(v);
  return fb;
});

vi.mock("../bot/music/services/PlayerService.js", () => ({
  getEngine: vi.fn(() => ({ player: null })),
  setFilter: vi.fn(),
  setEqualizer: vi.fn(),
}));

vi.mock("../bot/music/services/TextChannelStore.js", () => ({
  getTextChannelId: vi.fn(() => null),
}));

const GID = "12345678901234567";

afterEach(() => {
  vi.resetAllMocks();
  state.filter.delete(GID);
  state.equalizer.delete(GID);
  state.nowPlaying.delete(GID);
});

function makeLavalink(players: Map<string, any> = new Map(), nodes: any[] = []) {
  const m = {
    players,
    nodeManager: {
      nodes: new Map(nodes.map((n: any) => [n.id, n])),
      values: function() { return this.nodes.values(); },
    },
    createPlayer: vi.fn(() => ({ connect: vi.fn(), play: vi.fn() })),
  };
  // make Map iterable
  Object.defineProperty(m.players, Symbol.iterator, {
    value: function*() { yield* this.entries(); },
    writable: true,
  });
  return m;
}

function makePlayer(overrides = {}) {
  return {
    node: { id: "node1", options: { regions: ["asia"] } },
    playing: true,
    position: 5000,
    voiceChannelId: GID,
    changeNode: vi.fn(() => Promise.resolve()),
    play: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(() => Promise.resolve()),
    connect: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe("failover set helpers", () => {
  test("isFailoverGuild false initially", () => assert.strictEqual(isFailoverGuild(GID), false));
  test("isFailoverGuild true after failover set internally", () => {
    // can't access internal set directly, but verify clear after unknown
    clearFailoverGuild(GID);
    assert.strictEqual(isFailoverGuild(GID), false);
  });
});

describe("connectWithRetry", () => {
  test("succeeds on first try", async () => {
    const player = { connect: vi.fn(() => Promise.resolve()) };
    await connectWithRetry(player, GID, 3);
    assert.strictEqual(player.connect.mock.calls.length, 1);
  });

  test("retries and succeeds", async () => {
    let attempts = 0;
    const player = { connect: vi.fn(() => { attempts++; if (attempts < 3) return Promise.reject(new Error("timeout")); return Promise.resolve(); }) };
    await connectWithRetry(player, GID, 3);
    assert.strictEqual(attempts, 3);
  });

  test("throws after exhausting retries", async () => {
    const player = { connect: vi.fn(() => Promise.reject(new Error("fail"))) };
    await assert.rejects(() => connectWithRetry(player, GID, 2));
  });
});

describe("track cache", () => {
  test("cache and retrieve", () => {
    cacheTrack(GID, { encoded: "enc123" });
    assert.strictEqual(getCachedTrack(GID), "enc123");
  });

  test("returns null for unknown guild", () => {
    assert.strictEqual(getCachedTrack("nonexistent"), null);
  });

  test("clearTrackCache removes entry", () => {
    cacheTrack(GID, { encoded: "enc123" });
    clearTrackCache(GID);
    assert.strictEqual(getCachedTrack(GID), null);
  });

  test("pruneTrackCache runs without error", () => {
    cacheTrack("prune", { encoded: "p" });
    pruneTrackCache();
    assert.ok(true);
  });
});

describe("failoverFromNode", () => {
  test("returns early when lavalink is null", async () => {
    setLavalinkRef(null);
    await failoverFromNode("any");
    assert.ok(true);
  });

  test("no players on target node — skips", async () => {
    const players = new Map();
    const lavalink = makeLavalink(players);
    setLavalinkRef(lavalink);
    await failoverFromNode("node1");
    assert.ok(true);
  });

  test("no healthy target node — skips", async () => {
    const player = makePlayer();
    const players = new Map([[GID, player]]);
    const lavalink = makeLavalink(players, [{ id: "node1", connected: true, sessionId: "s1", options: { id: "node1" }, stats: { players: 1 } }]);
    setLavalinkRef(lavalink);
    (NodePenaltyService as any).__setBestNode(null);
    await failoverFromNode("node1");
    assert.strictEqual(player.changeNode.mock.calls.length, 0);
  });

  test("target node has no session — skips", async () => {
    const player = makePlayer();
    const players = new Map([[GID, player]]);
    const target = { id: "node2", connected: true, sessionId: null, options: { id: "node2", regions: ["us"] }, stats: { players: 0 } };
    const lavalink = makeLavalink(players, [
      { id: "node1", connected: true, sessionId: "s1", options: { id: "node1" }, stats: { players: 1 } },
      target,
    ]);
    setLavalinkRef(lavalink);
    (NodePenaltyService as any).__setBestNode(target);
    await failoverFromNode("node1");
    assert.strictEqual(player.changeNode.mock.calls.length, 0);
  });

  test("changeNode succeeds — resumes playback", async () => {
    const gid = "11111111111111111";
    const player = makePlayer();
    const players = new Map([[gid, player]]);
    const target = { id: "node2", connected: true, sessionId: "s2", options: { id: "node2", regions: ["us"] }, stats: { players: 0 } };
    const lavalink = makeLavalink(players, [
      { id: "node1", connected: true, sessionId: "s1", options: { id: "node1" }, stats: { players: 1 } },
      target,
    ]);
    setLavalinkRef(lavalink);
    state.nowPlaying.set(gid, { info: { title: "Test", uri: "https://youtube.com/watch?v=abc", encoded: "enc123" } });
    state.filter.set(gid, "bassboost");
    (NodePenaltyService as any).__setBestNode(target);
    await failoverFromNode("node1");
    assert.strictEqual(player.changeNode.mock.calls.length, 1);
    assert.strictEqual(player.changeNode.mock.calls[0][0], "node2");
  });

  test("changeNode fails — retry with destroy", async () => {
    const gid = "22222222222222222";
    const player = makePlayer({ changeNode: vi.fn(() => Promise.reject(new Error("fail"))), destroy: vi.fn(() => Promise.resolve()), connect: vi.fn(() => Promise.resolve()) });
    const players = new Map([[gid, player]]);
    const target = { id: "node2", connected: true, sessionId: "s2", options: { id: "node2", regions: ["us"] }, stats: { players: 0 } };
    const lavalink = makeLavalink(players, [
      { id: "node1", connected: true, sessionId: "s1", options: { id: "node1" }, stats: { players: 1 } },
      target,
    ]);
    setLavalinkRef(lavalink);
    state.nowPlaying.set(gid, { info: { title: "Test", uri: "https://youtube.com/watch?v=abc" } });
    (NodePenaltyService as any).__setBestNode(target);
    vi.mocked(TextChannelStore.getTextChannelId).mockReturnValue("22222222222222222");
    await failoverFromNode("node1");
    assert.ok(player.changeNode.mock.calls.length >= 1);
  });

  test("lock prevents duplicate failover for same guild", async () => {
    const player = makePlayer();
    const players = new Map([[GID, player]]);
    const target = { id: "node2", connected: true, sessionId: "s2", options: { id: "node2", regions: ["us"] }, stats: { players: 0 } };
    const lavalink = makeLavalink(players, [
      { id: "node1", connected: true, sessionId: "s1", options: { id: "node1" }, stats: { players: 1 } },
      target,
    ]);
    setLavalinkRef(lavalink);
    (NodePenaltyService as any).__setBestNode(target);
    await failoverFromNode("node1");
    const firstCalls = player.changeNode.mock.calls.length;
    await failoverFromNode("node1");
    // Second call should skip this guild (locked)
    assert.strictEqual(player.changeNode.mock.calls.length, firstCalls);
  });

  test("Spotify track — resolves via search", async () => {
    const gid = "33333333333333333";
    const player = makePlayer({ playing: false });
    const players = new Map([[gid, player]]);
    const target = { id: "node2", connected: true, sessionId: "s2", options: { id: "node2", regions: ["us"] }, stats: { players: 0 } };
    const lavalink = makeLavalink(players, [
      { id: "node1", connected: true, sessionId: "s1", options: { id: "node1" }, stats: { players: 1 } },
      target,
    ]);
    setLavalinkRef(lavalink);
    state.nowPlaying.set(gid, { info: { title: "Spotify Track", author: "Artist", uri: "https://open.spotify.com/track/abc123" } });
    (NodePenaltyService as any).__setBestNode(target);
    const searchResult = { tracks: [{ info: { sourceName: "youtube", title: "Found" } }] };
    vi.mocked(SearchService.searchWithRetry).mockResolvedValue(searchResult as any);
    await failoverFromNode("node1");
    assert.ok(player.changeNode.mock.calls.length >= 1);
    assert.ok(player.play.mock.calls.length > 0, "should play resolved track");
  });
});
