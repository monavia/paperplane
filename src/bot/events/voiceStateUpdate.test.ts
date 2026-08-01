import { describe, test, vi, beforeEach, afterEach } from "vitest";
import assert from "node:assert";

const h = vi.hoisted(() => ({
  mockEmbedBuilder: vi.fn().mockReturnValue({
    setDescription: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
  }),
  mockSetLastFilter: vi.fn().mockResolvedValue(undefined),
  mockSetAutoplay: vi.fn().mockResolvedValue(undefined),
  mockSetShuffle: vi.fn().mockResolvedValue(undefined),
  mockSetLastEqualizer: vi.fn().mockResolvedValue(undefined),
  mockIs247: vi.fn(),
  mockIsLavalinkReady: vi.fn(),
  mockGetEngine: vi.fn(),
  mockDestroyEngine: vi.fn(),
}));

vi.mock("discord.js", () => ({ EmbedBuilder: h.mockEmbedBuilder }));

vi.mock("../core/utils/Logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), safe: vi.fn().mockReturnValue(vi.fn()) },
}));

vi.mock("../core/constants/Colors.js", () => ({ default: { SUCCESS: 0, ERROR: 0, INFO: 0 } }));

vi.mock("../music/services/TextChannelStore.js", () => ({ getTextChannelId: vi.fn().mockReturnValue(null) }));

vi.mock("../database/repositories/GuildRepository.js", () => ({
  setLastFilter: h.mockSetLastFilter,
  setAutoplay: h.mockSetAutoplay,
  setShuffle: h.mockSetShuffle,
  setLastEqualizer: h.mockSetLastEqualizer,
}));

vi.mock("../music/engine/musicEvents.js", () => ({
  isIdleDisconnect: vi.fn().mockReturnValue(false),
  clearIdleDisconnect: vi.fn(),
  isStopDisconnect: vi.fn().mockReturnValue(false),
  clearStopDisconnect: vi.fn(),
}));

vi.mock("../core/state/StateManager.js", () => ({
  default: {
    twentyFourSeven: { isEnabled: h.mockIs247 },
    autoplay: new Map(),
    shuffle: new Map(),
    filter: new Map(),
    equalizer: new Map(),
  },
}));

vi.mock("../music/services/MusicService.js", () => ({ isLavalinkReady: h.mockIsLavalinkReady }));

vi.mock("../music/services/PlayerService.js", () => ({
  getEngine: h.mockGetEngine,
  destroyEngine: h.mockDestroyEngine,
}));

vi.mock("../music/services/StateService.js", () => ({ deleteState: vi.fn().mockResolvedValue(undefined) }));

import { start } from "./voiceStateUpdate.js";

const BOT_ID = "bot1";
const USER_ID = "user1";

let handler: (oldState: any, newState: any) => Promise<void>;

function makeMembers(ids: { id: string; bot: boolean }[]) {
  const map = new Map(ids.map((m) => [m.id, { id: m.id, user: { bot: m.bot } }]));
  (map as any).filter = (fn: any) => {
    const out = new Map();
    for (const [k, v] of map) if (fn(v, k, map)) out.set(k, v);
    return out;
  };
  return map;
}

function makeVc(ids: { id: string; bot: boolean }[]) {
  return {
    isVoiceBased: () => true,
    members: makeMembers(ids),
  };
}

function makeGuild(cache: Map<string, any>) {
  return { id: "g1", channels: { cache } };
}

async function fire(oldState: any, newState: any) {
  await handler(oldState, newState);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  h.mockIs247.mockReturnValue(false);
  h.mockIsLavalinkReady.mockReturnValue(true);
  h.mockGetEngine.mockReturnValue({ player: {} });
  handler = null as any;
  const client: any = { user: { id: BOT_ID }, on: (_evt: string, fn: any) => { handler = fn; } };
  start(client);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("voiceStateUpdate member moved", () => {
  test("starts alone timer when member is moved out and bot is alone", async () => {
    const oldVc = makeVc([{ id: BOT_ID, bot: true }]);
    const newVc = makeVc([{ id: USER_ID, bot: false }]);
    const guild = makeGuild(new Map([["vcA", oldVc], ["vcB", newVc]]));
    await fire(
      { member: { id: USER_ID }, channelId: "vcA", guild },
      { member: { id: USER_ID }, channelId: "vcB", guild },
    );

    vi.advanceTimersByTime(60_001);
    assert.equal(h.mockDestroyEngine.mock.calls.length, 1);
    assert.equal(h.mockDestroyEngine.mock.calls[0][0], "g1");
  });

  test("cancels timer when member moves back to the bot channel", async () => {
    const oldVc = makeVc([{ id: BOT_ID, bot: true }]);
    const newVc = makeVc([{ id: USER_ID, bot: false }]);
    const guild = makeGuild(new Map([["vcA", oldVc], ["vcB", newVc]]));
    await fire(
      { member: { id: USER_ID }, channelId: "vcA", guild },
      { member: { id: USER_ID }, channelId: "vcB", guild },
    );

    const vcA2 = makeVc([{ id: BOT_ID, bot: true }, { id: USER_ID, bot: false }]);
    const vcB2 = makeVc([]);
    const guild2 = makeGuild(new Map([["vcA", vcA2], ["vcB", vcB2]]));
    await fire(
      { member: { id: USER_ID }, channelId: "vcB", guild: guild2 },
      { member: { id: USER_ID }, channelId: "vcA", guild: guild2 },
    );

    vi.advanceTimersByTime(60_001);
    assert.equal(h.mockDestroyEngine.mock.calls.length, 0);
  });

  test("does not start timer when another human remains in old channel", async () => {
    const oldVc = makeVc([{ id: BOT_ID, bot: true }, { id: "user2", bot: false }]);
    const newVc = makeVc([{ id: USER_ID, bot: false }]);
    const guild = makeGuild(new Map([["vcA", oldVc], ["vcB", newVc]]));
    await fire(
      { member: { id: USER_ID }, channelId: "vcA", guild },
      { member: { id: USER_ID }, channelId: "vcB", guild },
    );

    vi.advanceTimersByTime(60_001);
    assert.equal(h.mockDestroyEngine.mock.calls.length, 0);
  });

  test("does not destroy when 24/7 enabled", async () => {
    h.mockIs247.mockReturnValue(true);
    const oldVc = makeVc([{ id: BOT_ID, bot: true }]);
    const newVc = makeVc([{ id: USER_ID, bot: false }]);
    const guild = makeGuild(new Map([["vcA", oldVc], ["vcB", newVc]]));
    await fire(
      { member: { id: USER_ID }, channelId: "vcA", guild },
      { member: { id: USER_ID }, channelId: "vcB", guild },
    );

    vi.advanceTimersByTime(60_001);
    assert.equal(h.mockDestroyEngine.mock.calls.length, 0);
  });

  test("does nothing when bot is not in the old channel", async () => {
    const oldVc = makeVc([{ id: USER_ID, bot: false }]);
    const newVc = makeVc([{ id: BOT_ID, bot: true }, { id: USER_ID, bot: false }]);
    const guild = makeGuild(new Map([["vcA", oldVc], ["vcB", newVc]]));
    await fire(
      { member: { id: USER_ID }, channelId: "vcA", guild },
      { member: { id: USER_ID }, channelId: "vcB", guild },
    );

    vi.advanceTimersByTime(60_001);
    assert.equal(h.mockDestroyEngine.mock.calls.length, 0);
  });

  test("skips destroy when lavalink is not ready", async () => {
    h.mockIsLavalinkReady.mockReturnValue(false);
    const oldVc = makeVc([{ id: BOT_ID, bot: true }]);
    const newVc = makeVc([{ id: USER_ID, bot: false }]);
    const guild = makeGuild(new Map([["vcA", oldVc], ["vcB", newVc]]));
    await fire(
      { member: { id: USER_ID }, channelId: "vcA", guild },
      { member: { id: USER_ID }, channelId: "vcB", guild },
    );

    vi.advanceTimersByTime(60_001);
    assert.equal(h.mockDestroyEngine.mock.calls.length, 0);
  });

  test("still starts timer on manual leave (regression)", async () => {
    const vc = makeVc([{ id: BOT_ID, bot: true }]);
    const guild = makeGuild(new Map([["vcA", vc]]));
    await fire(
      { member: { id: USER_ID }, channelId: "vcA", guild },
      { member: { id: USER_ID }, channelId: null, guild },
    );

    vi.advanceTimersByTime(60_001);
    assert.equal(h.mockDestroyEngine.mock.calls.length, 1);
  });
});
