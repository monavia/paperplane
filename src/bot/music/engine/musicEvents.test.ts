import { describe, test, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert";

vi.mock("./lavalink.js", () => ({ get: vi.fn(), cacheTrack: vi.fn(), clearTrackCache: vi.fn() }));
vi.mock("../services/PlayerService.js", () => ({ destroyEngine: vi.fn(), getEngine: vi.fn(() => ({ player: null })) }));
vi.mock("../../core/state/StateManager.js", () => ({
  default: {
    queues: { get: vi.fn(() => []), set: vi.fn(), clear: vi.fn(), has: vi.fn(() => false), syncToPlayer: vi.fn() },
    nowPlaying: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    position: { get: vi.fn(() => 0), set: vi.fn(), delete: vi.fn() },
    loop: { get: vi.fn(), delete: vi.fn() },
    twentyFourSeven: { isEnabled: vi.fn(() => false), getChannelId: vi.fn(() => ""), delete: vi.fn() },
    voiceChannels: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    autoplay: { get: vi.fn(() => false), set: vi.fn() },
    restored: { has: vi.fn(() => false) },
  }
}));
vi.mock("../../core/state/QueueLock.js", () => ({ withQueueLock: vi.fn((_: string, fn: Function) => fn()) }));
vi.mock("../../core/utils/Logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), ready: vi.fn(), safe: vi.fn(() => vi.fn()) }
}));
vi.mock("../../core/state/LyricsMessageStore.js", () => ({
  default: { get: vi.fn(), set: vi.fn(), delete: vi.fn() }
}));
vi.mock("./AutoplayEngine.js", () => ({
  default: function() { return { getNextTrack: vi.fn(), schedulePrefetch: vi.fn(), clearPrefetch: vi.fn(), recEngine: {} }; }
}));
vi.mock("../services/TitleResolver.js", () => ({
  cleanTitle: vi.fn((t: string) => ({ title: t, author: "" })),
  saveSpotifyMeta: vi.fn(() => ({})),
  applySpotifyMeta: vi.fn(),
}));
vi.mock("../services/SearchService.js", () => ({ findTrackWithDuration: vi.fn(() => null) }));
vi.mock("../../cache/CacheAdapter.js", () => ({ getAdapter: vi.fn(() => ({ get: vi.fn(), set: vi.fn() })) }));
vi.mock("../../cache/DeadTrackService.js", () => ({
  isDead: vi.fn(() => false), markDead: vi.fn(), deadFingerprint: vi.fn(() => ""), deadSpotifyFingerprint: vi.fn(() => ""),
}));
vi.mock("./TrackValidator.js", () => ({ validateTrack: vi.fn(async (_track: any, _player: any, _guildId: string) => ({ valid: true, track: _track })) }));
vi.mock("./FailoverManager.js", () => ({ isFailoverGuild: vi.fn(() => false), clearFailoverGuild: vi.fn() }));
vi.mock("./PlayerManager.js", () => ({ clearVoiceJoinTime: vi.fn() }));
vi.mock("../../database/repositories/GuildRepository.js", () => ({ getPrefix: vi.fn(() => "-") }));
vi.mock("../../ui/embeds/NowPlayingEmbed.js", () => ({ getSourceEmoji: vi.fn(() => "") }));

import * as musicEvents from "./musicEvents.js";
import * as lavalink from "./lavalink.js";
import state from "../../core/state/StateManager.js";
import Logger from "../../core/utils/Logger.js";
import * as EventBus from "../events/EventBus.js";

const registeredHandlers = new Map<string, Function>();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("idle disconnect", () => {
  test("starts false", () => {
    assert.strictEqual(musicEvents.isIdleDisconnect("idle-a"), false);
  });

  test("mark and check", () => {
    musicEvents.markIdleDisconnect("idle-b");
    assert.ok(musicEvents.isIdleDisconnect("idle-b"));
  });

  test("clear", () => {
    musicEvents.markIdleDisconnect("idle-c");
    musicEvents.clearIdleDisconnect("idle-c");
    assert.ok(!musicEvents.isIdleDisconnect("idle-c"));
  });

  test("guilds isolated", () => {
    musicEvents.markIdleDisconnect("idle-d");
    assert.ok(!musicEvents.isIdleDisconnect("idle-e"));
  });
});

describe("stop disconnect", () => {
  test("starts false", () => {
    assert.strictEqual(musicEvents.isStopDisconnect("stop-a"), false);
  });

  test("mark and check", () => {
    musicEvents.markStopDisconnect("stop-b");
    assert.ok(musicEvents.isStopDisconnect("stop-b"));
  });
});

describe("stuck timers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("normal: timer fires and stops player", async () => {
    const gid = "stuck-x";
    const player = { playing: true, guildId: gid, stopPlaying: vi.fn(() => Promise.resolve()), play: vi.fn(() => Promise.resolve()) };
    (lavalink.get as any).mockReturnValue({ players: { get: vi.fn(() => player) } });
    state.queues.get = vi.fn(() => []);

    musicEvents.startStuckTimer(gid);
    await vi.advanceTimersByTimeAsync(31000);

    assert.strictEqual(player.stopPlaying.mock.calls.length, 1);
  });

  test("unknown guild no throw", async () => {
    (lavalink.get as any).mockReturnValue({ players: { get: vi.fn(() => null) } });
    musicEvents.startStuckTimer("stuck-y");
    await vi.advanceTimersByTimeAsync(31000);
  });

  test("replace existing timer", async () => {
    const gid = "stuck-z";
    const player = { playing: true, guildId: gid, stopPlaying: vi.fn(() => Promise.resolve()), play: vi.fn(() => Promise.resolve()) };
    (lavalink.get as any).mockReturnValue({ players: { get: vi.fn(() => player) } });
    state.queues.get = vi.fn(() => []);

    musicEvents.startStuckTimer(gid);
    musicEvents.startStuckTimer(gid);
    await vi.advanceTimersByTimeAsync(31000);

    assert.strictEqual(player.stopPlaying.mock.calls.length, 1);
  });
});

test("markTrackStartSuppressed exists as exported function", () => {
  assert.strictEqual(typeof musicEvents.markTrackStartSuppressed, "function");
});

describe("network error pattern", () => {
  const NETWORK_RE = /econnreset|enotfound|econnrefused|etimedout|timeout|aborted/i;
  const DEEZER_RE = /deezer/i;

  test("ECONNRESET matches", () => assert.ok(NETWORK_RE.test("ECONNRESET")));
  test("ETIMEDOUT matches", () => assert.ok(NETWORK_RE.test("ETIMEDOUT")));
  test("ENOTFOUND matches", () => assert.ok(NETWORK_RE.test("ENOTFOUND")));
  test("timeout matches", () => assert.ok(NETWORK_RE.test("timeout")));
  test("aborted matches", () => assert.ok(NETWORK_RE.test("aborted")));
  test("generic error does not match", () => assert.ok(!NETWORK_RE.test("Something went wrong")));
  test("deezer not matched by network pattern", () => assert.ok(!NETWORK_RE.test("deezer error")));
  test("deezer pattern is case insensitive", () => assert.ok(DEEZER_RE.test("Deezer Error")));
});

describe("trackStuck fallback", () => {
  beforeEach(() => {
    (lavalink.get as any).mockReturnValue({ on: (e: string, h: Function) => { registeredHandlers.set(e, h); } });
    musicEvents.register({} as any);
  });

  test("stops player and blacklists track from autoplay", async () => {
    const player = { guildId: "stuck-g1", node: { connected: true }, stopPlaying: vi.fn(() => Promise.resolve()) };
    const track = { info: { title: "Stuck Track", uri: "youtube:abc" } };
    const marks: any[] = [];
    const off = EventBus.on("recommendation:markBad", (p: any) => { marks.push(p); });
    try {
      const handler = registeredHandlers.get("trackStuck");
      assert.ok(handler, "trackStuck handler registered");
      await handler(player, track, { thresholdMs: 15000 });
      assert.strictEqual(player.stopPlaying.mock.calls.length, 1);
      assert.strictEqual(marks.length, 1);
      assert.strictEqual(marks[0].guildId, "stuck-g1");
      assert.strictEqual(marks[0].source, "stuck");
      assert.strictEqual(marks[0].track, track);
    } finally {
      off();
    }
  });

  test("node disconnected — stops player safely without recovery", async () => {
    const player = { guildId: "stuck-g2", node: { connected: false }, stopPlaying: vi.fn(() => Promise.resolve()) };
    const track = { info: { title: "T2" } };
    const handler = registeredHandlers.get("trackStuck");
    assert.ok(handler, "trackStuck handler registered");
    await handler(player, track, { thresholdMs: 15000 });
    assert.strictEqual(player.stopPlaying.mock.calls.length, 0);
  });
});

describe("permanent track error detection", () => {
  test("matches YouTube login/playability failures", () => {
    assert.ok(musicEvents.isPermanentTrackError("AllClientsFailedException: (yts.version: 1.18.2) All clients failed to load the item."));
    assert.ok(musicEvents.isPermanentTrackError("This video requires login."));
    assert.ok(musicEvents.isPermanentTrackError("Video player configuration error"));
    assert.ok(musicEvents.isPermanentTrackError("AllClientsFailedException. Client [WEB] failed: This video requires login."));
    assert.ok(musicEvents.isPermanentTrackError("Sign in to confirm you're not a bot"));
    assert.ok(musicEvents.isPermanentTrackError("This video is unavailable"));
  });

  test("does not match transient errors", () => {
    assert.ok(!musicEvents.isPermanentTrackError("ECONNRESET"));
    assert.ok(!musicEvents.isPermanentTrackError("ETIMEDOUT"));
    assert.ok(!musicEvents.isPermanentTrackError("Something went wrong"));
    assert.ok(!musicEvents.isPermanentTrackError(""));
  });
});

describe("error loop detection", () => {
  function simulateCheck(existingTimestamps: number[]): { isLoop: boolean; count: number } {
    const now = Date.now();
    const recent = existingTimestamps.filter(t => now - t < 15000);
    recent.push(now);
    return { isLoop: recent.length >= 5, count: recent.length };
  }

  test("single error not loop", () => {
    const { isLoop } = simulateCheck([]);
    assert.ok(!isLoop);
  });

  test("5+ errors within 15s triggers loop", () => {
    const recent = Date.now() - 1000;
    const timestamps = [recent, recent, recent, recent];
    const { isLoop } = simulateCheck(timestamps);
    assert.ok(isLoop);
  });

  test("errors older than 15s filtered out", () => {
    const old = Date.now() - 20000;
    const timestamps = [old, old, old, old];
    const { isLoop } = simulateCheck(timestamps);
    assert.ok(!isLoop);
  });
});

describe("trackStart autoplay prefetch scheduling", () => {
  beforeEach(() => {
    (lavalink.get as any).mockReturnValue({
      on: (e: string, h: Function) => { registeredHandlers.set(e, h); },
      players: { get: vi.fn(() => null) },
    });
    musicEvents.register({} as any);
  });

  afterEach(() => {
    for (const g of ["pf-1", "pf-2", "pf-3", "pf-4", "pf-5"]) musicEvents.clearStuckTimer(g);
  });

  function mockState(autoplayOn: boolean, loopMode: any, queue: any[]): void {
    state.autoplay.get = vi.fn(() => autoplayOn);
    state.loop.get = vi.fn(() => loopMode);
    state.queues.get = vi.fn(() => queue);
  }

  test("schedules prefetch when autoplay on, queue empty, loop off", async () => {
    mockState(true, undefined, []);
    const inst = (musicEvents as any).autoplayInst;
    const player = { guildId: "pf-1", connected: true, node: { connected: true } };
    const track = { info: { title: "T", author: "A", duration: 200_000 } };
    const handler = registeredHandlers.get("trackStart");
    assert.ok(handler, "trackStart handler registered");
    await handler(player, track);
    assert.strictEqual(inst.schedulePrefetch.mock.calls.length, 1);
    assert.strictEqual(inst.schedulePrefetch.mock.calls[0][1], track);
    assert.strictEqual(inst.schedulePrefetch.mock.calls[0][3], 200_000);
  });

  test("does not schedule when autoplay off", async () => {
    mockState(false, undefined, []);
    const inst = (musicEvents as any).autoplayInst;
    const player = { guildId: "pf-2", connected: true, node: { connected: true } };
    const handler = registeredHandlers.get("trackStart");
    assert.ok(handler);
    await handler(player, { info: { title: "T", author: "A", duration: 200_000 } });
    assert.strictEqual(inst.schedulePrefetch.mock.calls.length, 0);
  });

  test("does not schedule when queue still has tracks", async () => {
    mockState(true, undefined, [{ info: { title: "Q" } }]);
    const inst = (musicEvents as any).autoplayInst;
    const player = { guildId: "pf-3", connected: true, node: { connected: true } };
    const handler = registeredHandlers.get("trackStart");
    assert.ok(handler);
    await handler(player, { info: { title: "T", author: "A", duration: 200_000 } });
    assert.strictEqual(inst.schedulePrefetch.mock.calls.length, 0);
  });

  test("does not schedule when loop track", async () => {
    mockState(true, "track", []);
    const inst = (musicEvents as any).autoplayInst;
    const player = { guildId: "pf-4", connected: true, node: { connected: true } };
    const handler = registeredHandlers.get("trackStart");
    assert.ok(handler);
    await handler(player, { info: { title: "T", author: "A", duration: 200_000 } });
    assert.strictEqual(inst.schedulePrefetch.mock.calls.length, 0);
  });

  test("does not schedule when duration unknown (live stream)", async () => {
    mockState(true, undefined, []);
    const inst = (musicEvents as any).autoplayInst;
    const player = { guildId: "pf-5", connected: true, node: { connected: true } };
    const handler = registeredHandlers.get("trackStart");
    assert.ok(handler);
    await handler(player, { info: { title: "Live", author: "A" } });
    assert.strictEqual(inst.schedulePrefetch.mock.calls.length, 0);
  });
});
