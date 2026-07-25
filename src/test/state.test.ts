// @ts-nocheck
import { describe, test, beforeAll, vi, afterEach } from "vitest";
import assert from "node:assert";
import {
  saveState, deleteState, restoreGuildState, restoreAllStates,
  isRestoredGuild, addRestoredGuild, clearRestoredGuild, startPositionSync, stopPositionSync,
} from "../bot/music/services/StateService.js";
import state from "../bot/core/state/StateManager.js";

const mock = vi.hoisted(() => {
  const upsertPlayerState = vi.fn(() => Promise.resolve());
  const deletePlayerState = vi.fn(() => Promise.resolve());
  const deleteOldPlayerStates = vi.fn(() => Promise.resolve());
  const findRecentPlayerStates = vi.fn(() => Promise.resolve([]));
  const updatePlayerState = vi.fn(() => Promise.resolve());
  const engineJoin = vi.fn(() => Promise.resolve(null));
  const playerPlay = vi.fn(() => Promise.resolve());
  const playerDestroy = vi.fn(() => Promise.resolve());
  const changeNode = vi.fn(() => Promise.resolve());
  const createPlayer = vi.fn();
  const fetchPlayer = vi.fn(() => Promise.resolve(null));
  const searchFn = vi.fn(() => Promise.resolve(null));
  const setTextChannelId = vi.fn();
  const setFilterFn = vi.fn();
  const setEqualizerFn = vi.fn();
  const destroyEngineFn = vi.fn();
  const getAutoplay = vi.fn(() => Promise.resolve(false));
  const getLoop = vi.fn(() => Promise.resolve("off"));
  const getShuffle = vi.fn(() => Promise.resolve(false));
  const get247 = vi.fn(() => Promise.resolve(false));
  const getLastFilter = vi.fn(() => Promise.resolve("none"));
  const getLastEqualizer = vi.fn(() => Promise.resolve(null));
  const lavalinkGet = vi.fn(() => null);
  const lavalinkConnectWithRetry = vi.fn(() => Promise.resolve());
  const isLavalinkReady = vi.fn(() => false);

  const mockClient = () => ({
    guilds: { cache: { get: vi.fn(() => null) } },
    channels: { cache: { get: vi.fn(() => null) } },
  });

  const playerFactory = (overrides = {}) => ({
    connected: true,
    node: { connected: true, id: "node1", fetchPlayer },
    voiceChannelId: "123",
    position: 0,
    playing: false,
    queue: { current: null },
    play: playerPlay,
    destroy: playerDestroy,
    changeNode,
    search: searchFn,
    ...overrides,
  });

  const engineFactory = (overrides = {}) => ({
    player: { connected: true, node: { connected: true, id: "node1", fetchPlayer }, voiceChannelId: "123" },
    queue: { getAll: () => [], add: () => {}, size: () => 0, next: () => null },
    join: engineJoin,
    ...overrides,
  });

  const getEngine = vi.fn(() => engineFactory());

  return {
    upsertPlayerState, deletePlayerState, deleteOldPlayerStates, findRecentPlayerStates, updatePlayerState,
    engineJoin, playerPlay, playerDestroy, changeNode, createPlayer, fetchPlayer, search: searchFn,
    setTextChannelId, setFilterFn, setEqualizerFn, destroyEngineFn,
    getAutoplay, getLoop, getShuffle, get247, getLastFilter, getLastEqualizer,
    lavalinkGet, lavalinkConnectWithRetry, isLavalinkReady,
    getEngine, engineFactory, playerFactory, mockClient,
  };
});

vi.mock("mongoose", () => ({
  default: { model: () => ({}), connection: { readyState: 1 } },
}));

vi.mock("../bot/database/models/PlayerState.js", () => ({
  default: {
    findOneAndUpdate: (...a: any[]) => mock.upsertPlayerState(...a),
    deleteOne: (...a: any[]) => mock.deletePlayerState(...a),
    deleteMany: (...a: any[]) => mock.deleteOldPlayerStates(...a),
    find: (...a: any[]) => mock.findRecentPlayerStates(...a),
    updateOne: (...a: any[]) => mock.updatePlayerState(...a),
  },
}));

vi.mock("../bot/core/utils/Logger.js", () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, ready: () => {}, safe: () => () => {} },
  info: () => {}, warn: () => {}, error: () => {}, ready: () => {}, safe: () => () => {},
}));

vi.mock("../bot/music/services/PlayerService.js", () => ({
  getEngine: (...a: any[]) => mock.getEngine(...a),
  setFilter: (...a: any[]) => mock.setFilterFn(...a),
  setEqualizer: (...a: any[]) => mock.setEqualizerFn(...a),
  destroyEngine: (...a: any[]) => mock.destroyEngineFn(...a),
}));

vi.mock("../bot/music/engine/lavalink.js", () => ({
  get: (...a: any[]) => mock.lavalinkGet(...a),
  getClient: () => mock.mockClient(),
  connectWithRetry: (...a: any[]) => mock.lavalinkConnectWithRetry(...a),
  getConnectedNodes: () => [],
  cacheTrack: () => {},
  getCachedTrack: () => null,
  clearTrackCache: () => {},
}));

vi.mock("../bot/database/connection.js", () => ({ isUsingPrisma: () => false }));

vi.mock("../bot/database/repositories/GuildRepository.js", () => ({
  getAutoplay: (...a: any[]) => mock.getAutoplay(...a),
  getLoop: (...a: any[]) => mock.getLoop(...a),
  getShuffle: (...a: any[]) => mock.getShuffle(...a),
  get247: (...a: any[]) => mock.get247(...a),
  getLastFilter: (...a: any[]) => mock.getLastFilter(...a),
  getLastEqualizer: (...a: any[]) => mock.getLastEqualizer(...a),
}));

vi.mock("../bot/music/services/TextChannelStore.js", () => ({
  getTextChannelId: () => null,
  setTextChannelId: (...a: any[]) => mock.setTextChannelId(...a),
}));

vi.mock("../bot/core/state/QueueLock.js", () => ({
  withQueueLock: (_: string, fn: () => any) => fn(),
}));

vi.mock("discord.js", () => ({
  EmbedBuilder: class { setDescription() { return this; } setColor() { return this; } },
}));

const FID = "12345678901234567";

afterEach(() => {
  vi.clearAllMocks();
  state.loop.delete(FID);
  state.nowPlaying.delete(FID);
  state.queues.clear(FID);
  state.restored.clear();
});

describe("saveState / deleteState", () => {
  test("saveState skips when player null", async () => {
    await saveState(FID);
    assert.strictEqual(mock.upsertPlayerState.mock.calls.length, 0);
  });

  test("saveState calls upsert with player data", async () => {
    const eng = mock.engineFactory({
      player: { voiceChannelId: FID, position: 5000, lastPosition: 4800, playing: true, node: { id: "node1", options: { regions: ["asia"] } } },
    });
    mock.getEngine.mockReturnValue(eng);
    state.nowPlaying.set(FID, { info: { title: "Now" } });
    state.queues.set(FID, [{ info: { title: "Queued" } }]);

    await saveState(FID);
    assert.ok(mock.upsertPlayerState.mock.calls.length > 0);
    const data = mock.upsertPlayerState.mock.calls[0][1];
    assert.strictEqual(data.voiceChannelId, FID);
  });

  test("deleteState clears stores and calls deleteOne", async () => {
    state.loop.set(FID, "track");
    state.nowPlaying.set(FID, {});
    state.queues.set(FID, [{}]);

    await deleteState(FID);
    assert.strictEqual(state.loop.get(FID), "off"); // LoopStore default when absent
    assert.strictEqual(state.nowPlaying.get(FID), undefined);
    assert.strictEqual(state.queues.get(FID)?.length, 0);
    assert.ok(mock.deletePlayerState.mock.calls.length > 0);
  });
});

describe("startPositionSync / stopPositionSync", () => {
  test("start + stop position sync doesn't crash", async () => {
    const eng = mock.engineFactory({ player: null });
    mock.getEngine.mockReturnValue(eng);
    startPositionSync(FID);
    stopPositionSync(FID);
    assert.ok(true);
  });
});

describe("restoreGuildState", () => {
  function makeSaved(overrides = {}) {
    return {
      guildId: FID,
      voiceChannelId: FID,
      textChannelId: null,
      nowPlaying: null,
      queue: [],
      position: 0,
      nodeId: "node1",
      ...overrides,
    };
  }

  test("returns true when already restored", async () => {
    addRestoredGuild(FID);
    const r = await restoreGuildState(mock.mockClient(), makeSaved());
    assert.strictEqual(r, true);
  });

  test("returns false when guild not in cache", async () => {
    const r = await restoreGuildState(mock.mockClient(), makeSaved());
    assert.strictEqual(r, false);
  });

  test("returns false when voice channel missing", async () => {
    const client = {
      guilds: {
        cache: {
          get: vi.fn(() => ({
            channels: { cache: { get: vi.fn(() => null) } },
          })),
        },
      },
      channels: { cache: { get: vi.fn(() => null) } },
    };
    const r = await restoreGuildState(client, makeSaved());
    assert.strictEqual(r, false);
  });

  test("returns false when engine.join fails", async () => {
    mock.engineJoin.mockResolvedValue(null);
    const client = {
      guilds: {
        cache: {
          get: vi.fn(() => ({
            channels: { cache: { get: vi.fn(() => ({ isVoiceBased: () => true })) } },
          })),
        },
      },
      channels: { cache: { get: vi.fn(() => null) } },
    };
    const r = await restoreGuildState(client, makeSaved());
    assert.strictEqual(r, false);
  });


});

describe("restoreAllStates", () => {
  test("restoreAllStates when no recent states", async () => {
    mock.lavalinkGet.mockReturnValue(null);
    await restoreAllStates(mock.mockClient());
    assert.ok(true);
  });
});

describe("restored set helpers", () => {
  test("isRestoredGuild reflects add/clear", () => {
    assert.strictEqual(isRestoredGuild(FID), false);
    addRestoredGuild(FID);
    assert.strictEqual(isRestoredGuild(FID), true);
    clearRestoredGuild(FID);
    assert.strictEqual(isRestoredGuild(FID), false);
  });
});
