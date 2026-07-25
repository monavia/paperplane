// @ts-nocheck
import { describe, test, vi, afterEach } from "vitest";
import assert from "node:assert";
import {
  markIdleDisconnect, isIdleDisconnect, clearIdleDisconnect,
  markStopDisconnect, isStopDisconnect, clearStopDisconnect,
  startStuckTimer, clearStuckTimer,
  markManualAdvance, clearDisconnectTimer, markTrackStartSuppressed, advanceQueue,
} from "../bot/music/engine/musicEvents.js";

const mock = vi.hoisted(() => ({
  isDead: vi.fn(() => false),
  findTrackWithDuration: vi.fn(() => null),
  cacheGet: vi.fn(() => null),
  cacheSet: vi.fn(),
  searchResolve: vi.fn(() => Promise.resolve({ tracks: [] })),
}));

vi.mock("../bot/core/state/QueueLock.js", () => ({
  withQueueLock: (_gid: string, fn: () => any) => fn(),
}));

vi.mock("../bot/core/utils/Logger.js", () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, ready: () => {}, safe: () => () => {} },
}));

vi.mock("../bot/music/services/TextChannelStore.js", () => ({
  getTextChannelId: () => null,
}));

vi.mock("@sentry/node", () => ({ captureException: () => {} }));

vi.mock("../bot/music/engine/lavalink.js", () => ({
  get: () => ({ players: new Map() }),
  getClient: () => null,
}));

vi.mock("../bot/cache/CacheAdapter.js", () => ({
  getAdapter: () => ({ get: mock.cacheGet, set: mock.cacheSet }),
}));

vi.mock("../bot/cache/DeadTrackService.js", () => ({
  isDead: (...a: any[]) => mock.isDead(...a),
  markDead: () => {},
  deadFingerprint: () => "fp",
  deadSpotifyFingerprint: () => "sfp",
}));

vi.mock("../bot/music/services/SearchService.js", () => ({
  findTrackWithDuration: (...a: any[]) => mock.findTrackWithDuration(...a),
}));

vi.mock("../bot/music/services/TitleResolver.js", () => ({
  cleanTitle: (t: string) => ({ title: t, author: "" }),
  saveSpotifyMeta: () => ({}),
  applySpotifyMeta: () => {},
}));

vi.mock("../bot/ui/embeds/NowPlayingEmbed.js", () => ({
  getSourceEmoji: () => ":音符:",
}));

vi.mock("../bot/services/ActivityService.js", () => ({
  default: { trackPlayed: () => {} },
}));

vi.mock("discord.js", () => ({
  EmbedBuilder: class { setDescription() { return this; } setColor() { return this; } },
}));

import state from "../bot/core/state/StateManager.js";
import * as EventBus from "../bot/music/events/EventBus.js";

const GID = "12345678901234567";

afterEach(() => {
  vi.resetAllMocks();
  clearDisconnectTimer(GID);
  clearStuckTimer(GID);
  state.queues.clear(GID);
  state.nowPlaying.delete(GID);
  state.loop.delete(GID);
  state.autoplay.delete(GID);
  state.restored.delete(GID);
  state.position.delete(GID);
  if (isIdleDisconnect(GID)) clearIdleDisconnect(GID);
  if (isStopDisconnect(GID)) clearStopDisconnect(GID);
});

function makePlayer(overrides = {}) {
  return {
    guildId: GID,
    playing: false,
    paused: false,
    voiceChannelId: GID,
    position: 0,
    node: { connected: true, name: "test-node", options: { regions: ["asia"] } },
    play: vi.fn(() => Promise.resolve()),
    stopPlaying: vi.fn(() => Promise.resolve()),
    disconnect: vi.fn(),
    destroy: vi.fn(),
    search: vi.fn(() => Promise.resolve({ tracks: [] })),
    ...overrides,
  };
}

function track(id: number) {
  return {
    encoded: `enc${id}`,
    info: { title: `Track ${id}`, author: "Artist", uri: `https://example.com/${id}`, identifier: `id${id}` },
  };
}

describe("disconnect flags", () => {
  test("idleDisconnect starts false", () => assert.strictEqual(isIdleDisconnect(GID), false));
  test("idleDisconnect mark/clear", () => {
    markIdleDisconnect(GID);
    assert.strictEqual(isIdleDisconnect(GID), true);
    clearIdleDisconnect(GID);
    assert.strictEqual(isIdleDisconnect(GID), false);
  });
  test("stopDisconnect starts false", () => assert.strictEqual(isStopDisconnect(GID), false));
  test("stopDisconnect mark/clear", () => {
    markStopDisconnect(GID);
    assert.strictEqual(isStopDisconnect(GID), true);
    clearStopDisconnect(GID);
    assert.strictEqual(isStopDisconnect(GID), false);
  });
});

describe("stuckTimer", () => {
  test("startStuckTimer then clearStuckTimer does not throw", () => {
    startStuckTimer(GID);
    clearStuckTimer(GID);
    assert.ok(true);
  });
});

describe("clearDisconnectTimer / markManualAdvance", () => {
  test("clearDisconnectTimer for unknown guild", () => {
    clearDisconnectTimer(GID);
    assert.ok(true);
  });
  test("markManualAdvance / markTrackStartSuppressed", () => {
    markManualAdvance(GID);
    markTrackStartSuppressed(GID);
    assert.ok(true);
  });
});

describe("advanceQueue", () => {
  test("empty queue returns null", async () => {
    const r = await advanceQueue(makePlayer());
    assert.strictEqual(r, null);
  });

  test("plays first track from queue", async () => {
    const player = makePlayer();
    state.queues.set(GID, [track(1), track(2)]);
    const r = await advanceQueue(player);
    assert.ok(r);
    assert.strictEqual(r.info.title, "Track 1");
    assert.strictEqual(player.play.mock.calls.length, 1);
    assert.strictEqual(state.nowPlaying.get(GID)?.info?.title, "Track 1");
  });

  test("skips dead tracks", async () => {
    let callCount = 0;
    mock.isDead.mockImplementation(() => { callCount++; return Promise.resolve(callCount <= 1); });
    const player = makePlayer();
    state.queues.set(GID, [track(1), track(2)]);
    const r = await advanceQueue(player);
    assert.ok(r);
    assert.strictEqual(r.info.title, "Track 2");
  });

  test("playlist loop re-queues played track", async () => {
    const player = makePlayer();
    state.loop.set(GID, "playlist");
    state.queues.set(GID, [track(1), track(2)]);
    await advanceQueue(player);
    const q = state.queues.get(GID);
    assert.strictEqual(q.length, 2);
    assert.strictEqual(q[q.length - 1]?.info?.title, "Track 1");
  });

  test("returns null when all tracks dead", async () => {
    mock.isDead.mockResolvedValue(true);
    const player = makePlayer();
    state.queues.set(GID, [track(1), track(2), track(3)]);
    const r = await advanceQueue(player);
    assert.strictEqual(r, null);
  });

  test("re-resolves non-encoded Spotify track", async () => {
    mock.findTrackWithDuration.mockResolvedValue({ encoded: "new-enc", info: { title: "Found", author: "Searched" } });
    mock.cacheGet.mockResolvedValue(null);
    const player = makePlayer();
    const spotifyTrack = {
      info: { title: "Spotify", author: "Artist", uri: "https://open.spotify.com/track/abc123" },
    };
    state.queues.set(GID, [spotifyTrack]);
    const r = await advanceQueue(player);
    assert.ok(r);
    assert.strictEqual(r.encoded, "new-enc");
  });
});
