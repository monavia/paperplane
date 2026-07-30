import { describe, test, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert";

vi.mock("./lavalink.js", () => ({ get: vi.fn(), cacheTrack: vi.fn(), clearTrackCache: vi.fn() }));
vi.mock("../services/PlayerService.js", () => ({ destroyEngine: vi.fn(), getEngine: vi.fn(() => ({ player: null })) }));
vi.mock("../../core/state/StateManager.js", () => ({
  default: {
    queues: { get: vi.fn(() => []), set: vi.fn(), clear: vi.fn(), has: vi.fn(() => false) },
    nowPlaying: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    position: { get: vi.fn(() => 0), set: vi.fn(), delete: vi.fn() },
    loop: { get: vi.fn(), delete: vi.fn() },
    twentyFourSeven: { isEnabled: vi.fn(() => false), getChannelId: vi.fn(() => ""), delete: vi.fn() },
    voiceChannels: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
    autoplay: { get: vi.fn(() => false) },
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
  default: function() { return { getNextTrack: vi.fn(), recEngine: {} }; }
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
vi.mock("./FailoverManager.js", () => ({ isFailoverGuild: vi.fn(() => false), clearFailoverGuild: vi.fn() }));
vi.mock("./PlayerManager.js", () => ({ clearVoiceJoinTime: vi.fn() }));
vi.mock("../../database/repositories/GuildRepository.js", () => ({ getPrefix: vi.fn(() => "-") }));
vi.mock("../../ui/embeds/NowPlayingEmbed.js", () => ({ getSourceEmoji: vi.fn(() => "") }));

import * as musicEvents from "./musicEvents.js";
import * as lavalink from "./lavalink.js";
import state from "../../core/state/StateManager.js";
import Logger from "../../core/utils/Logger.js";

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
