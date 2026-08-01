import { describe, test, vi, beforeEach } from "vitest";
import assert from "node:assert";

const mockEmbedBuilder = vi.fn(function () {
  return {
    setDescription: vi.fn().mockReturnThis(),
    setColor: vi.fn().mockReturnThis(),
    setTitle: vi.fn().mockReturnThis(),
    setAuthor: vi.fn().mockReturnThis(),
  };
});
vi.mock("discord.js", () => ({ EmbedBuilder: mockEmbedBuilder, MessageType: { Reply: 18 } }));

const mockConfigTrigger = "mona";
vi.mock("../config/bot.js", () => ({ default: { trigger: mockConfigTrigger, token: "", prefix: "-" } }));

const mockRunAIAsk = vi.fn();
const mockRunAIAskFresh = vi.fn();
const mockRunAIInterpret = vi.fn();
vi.mock("../ai/services/AITaskQueue.js", () => ({ runAIAsk: mockRunAIAsk, runAIAskFresh: mockRunAIAskFresh, runAIInterpret: mockRunAIInterpret }));

const mockCheckPrompt = vi.fn();
vi.mock("../ai/services/PromptFilter.js", () => ({ checkPrompt: mockCheckPrompt }));

const mockSaveMemory = vi.fn().mockResolvedValue(undefined);
const mockGetMemoryContext = vi.fn().mockResolvedValue("");
vi.mock("../ai/services/MemoryService.js", () => ({
  default: { saveMemory: mockSaveMemory, getMemoryContext: mockGetMemoryContext },
}));

vi.mock("../core/utils/Logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), safe: vi.fn().mockReturnValue(vi.fn()) },
}));

const mockIncCommandsExecuted = vi.fn();
const mockObserveCommandLatency = vi.fn();
vi.mock("../telemetry/MetricsCollector.js", () => ({
  incCommandsExecuted: mockIncCommandsExecuted,
  observeCommandLatency: mockObserveCommandLatency,
}));

vi.mock("../core/constants/Colors.js", () => ({ default: { SUCCESS: 0, ERROR: 0, INFO: 0 } }));

vi.mock("../ui/embeds/ErrorEmbed.js", () => ({ build: vi.fn().mockReturnValue({ description: "" }) }));

const mockGetPrefix = vi.fn();
const mockSetPrefix = vi.fn();
vi.mock("../database/repositories/GuildRepository.js", () => ({ getPrefix: mockGetPrefix, setPrefix: mockSetPrefix }));

const mockIsLavalinkReady = vi.fn();
const mockGetEngineM = vi.fn();
const mockSkip = vi.fn();
const mockStop = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
vi.mock("../music/services/MusicService.js", () => ({
  isLavalinkReady: mockIsLavalinkReady,
  getEngine: mockGetEngineM,
  skip: mockSkip,
  stop: mockStop,
  pause: mockPause,
  resume: mockResume,
}));

const mockGetQueue = vi.fn();
vi.mock("../music/services/QueueService.js", () => ({ getQueue: mockGetQueue }));

vi.mock("../core/state/StateManager.js", () => ({
  default: {
    queues: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
    nowPlaying: { get: vi.fn(), set: vi.fn() },
    autoplay: { get: vi.fn(), set: vi.fn() },
    shuffle: { get: vi.fn(), set: vi.fn() },
    loop: { get: vi.fn(), set: vi.fn() },
    twentyFourSeven: { isEnabled: vi.fn(), set: vi.fn() },
  },
}));

const mockGetLavalink = vi.fn();
vi.mock("../music/engine/lavalink.js", () => ({ get: mockGetLavalink }));
vi.mock("../music/services/TextChannelStore.js", () => ({ setTextChannelId: vi.fn() }));
const mockWithQueueLock = vi.fn(async (_guildId: string, fn: Function) => { await fn(); });
vi.mock("../core/state/QueueLock.js", () => ({ withQueueLock: mockWithQueueLock }));
vi.mock("../music/engine/musicEvents.js", () => ({ markTrackStartSuppressed: vi.fn(), markStopDisconnect: vi.fn() }));
vi.mock("../music/services/StateService.js", () => ({ saveState: vi.fn() }));
const mockPickBestTrack = vi.fn((tracks: any[]) => tracks?.[0] ?? null);
vi.mock("../music/services/SearchService.js", () => ({ pickBestTrack: mockPickBestTrack }));
vi.mock("../ui/embeds/NowPlayingEmbed.js", () => ({ build: vi.fn() }));
vi.mock("../ui/embeds/QueueEmbed.js", () => ({ build: vi.fn() }));

const mockCdCheck = vi.fn();
const mockCdSet = vi.fn();
const mockCdGetRemaining = vi.fn(() => 5000);
vi.mock("../core/utils/CooldownManager.js", () => ({
  default: { check: mockCdCheck, set: mockCdSet, getRemaining: mockCdGetRemaining },
}));

describe("messageCreate", () => {
  const listeners = new Map<string, Function>();
  const mockExecute = vi.fn();
  const prefixCommands = new Map<string, any>();
  const mockClient: any = {
    on(event: string, handler: Function) { listeners.set(event, handler); },
    prefixCommands,
    user: { id: "12345" },
  };
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    prefixCommands.clear();
    listeners.clear();
    mockGetPrefix.mockResolvedValue("-");
    mockCdCheck.mockReturnValue(true);
    mockIsLavalinkReady.mockReturnValue(true);
    mockCheckPrompt.mockReturnValue({ blocked: false });
    const mod = await import("./messageCreate.js");
    mod.start(mockClient);
    handler = listeners.get("messageCreate")!;
  });

  function makeMessage(overrides: any = {}) {
    return {
      author: { bot: false, id: "user1", username: "User" },
      guild: { id: "g1" },
      guildId: "g1",
      member: { displayName: "User", voice: { channel: null } },
      channel: { send: vi.fn(), sendTyping: vi.fn().mockReturnValue({ catch: vi.fn() }) },
      content: "",
      ...overrides,
    };
  }

  test("ignores bot messages", async () => {
    const msg = makeMessage({ author: { bot: true, id: "bot1" } });
    await handler(msg);
    assert.strictEqual(mockExecute.mock.calls.length, 0);
  });

  test("ignores DMs", async () => {
    const msg = makeMessage({ guild: null, guildId: null });
    await handler(msg);
    assert.strictEqual(mockExecute.mock.calls.length, 0);
  });

  test("executes registered prefix command", async () => {
    prefixCommands.set("ping", { name: "ping", execute: mockExecute });
    mockExecute.mockResolvedValue(undefined);
    const msg = makeMessage({ content: "-ping" });
    await handler(msg);
    assert.strictEqual(mockExecute.mock.calls.length, 1);
    assert.strictEqual(mockIncCommandsExecuted.mock.calls.length, 1);
  });

  test("ignores unknown prefix command", async () => {
    const msg = makeMessage({ content: "-unknown" });
    await handler(msg);
    assert.strictEqual(mockExecute.mock.calls.length, 0);
  });

  test("non-prefix not dispatched", async () => {
    const msg = makeMessage({ content: "hello" });
    await handler(msg);
    assert.strictEqual(mockExecute.mock.calls.length, 0);
    assert.strictEqual(msg.channel.send.mock.calls.length, 0);
  });

  test("ignores non-AI non-prefix", async () => {
    const msg = makeMessage({ content: "some random text not triggering AI" });
    await handler(msg);
    assert.strictEqual(mockExecute.mock.calls.length, 0);
    assert.strictEqual(msg.channel.send.mock.calls.length, 0);
  });

  test("triggers AI on bot mention", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "chat", reply: "Hello AI!" });
    const msg = makeMessage({ content: "<@12345> hello" });
    await handler(msg);
    assert.strictEqual(msg.channel.send.mock.calls.length, 1);
    assert.strictEqual(mockCheckPrompt.mock.calls.length, 1);
    assert.strictEqual(mockRunAIInterpret.mock.calls.length, 1);
  });

  test("triggers AI on trigger word", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "chat", reply: "Hello AI!" });
    const msg = makeMessage({ content: "mona hello there" });
    await handler(msg);
    assert.strictEqual(msg.channel.send.mock.calls.length, 1);
    assert.strictEqual(mockRunAIInterpret.mock.calls.length, 1);
  });

  test("blocks filtered prompts", async () => {
    mockCheckPrompt.mockReturnValue({ blocked: true, reason: "Filtered content." });
    const msg = makeMessage({ content: "<@12345> bad thing" });
    await handler(msg);
    assert.strictEqual(msg.channel.send.mock.calls[0][0], "Filtered content.");
  });

  test("triggers AI on reply to bot message", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "chat", reply: "Hello!" });
    const msg = makeMessage({
      type: 18,
      reference: { messageId: "m1" },
      referencedMessage: { author: { id: "12345" } },
      content: "how are you",
    });
    await handler(msg);
    assert.strictEqual(mockRunAIInterpret.mock.calls.length, 1);
    assert.strictEqual(msg.channel.send.mock.calls.length, 1);
  });

  test("does not trigger AI on reply to non-bot message", async () => {
    const msg = makeMessage({
      type: 18,
      reference: { messageId: "m1" },
      referencedMessage: { author: { id: "other-user" } },
      content: "hi",
    });
    await handler(msg);
    assert.strictEqual(mockRunAIInterpret.mock.calls.length, 0);
    assert.strictEqual(msg.channel.send.mock.calls.length, 0);
  });

  test("reply falls back to fetchReference when not cached", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "chat", reply: "Hello!" });
    const fetchRef = vi.fn().mockResolvedValue({ author: { id: "12345" } });
    const msg = makeMessage({
      type: 18,
      reference: { messageId: "m1" },
      fetchReference: fetchRef,
      content: "hey bot",
    });
    await handler(msg);
    assert.strictEqual(fetchRef.mock.calls.length, 1);
    assert.strictEqual(mockRunAIInterpret.mock.calls.length, 1);
  });

  test("reply to bot with empty content is ignored", async () => {
    const msg = makeMessage({
      type: 18,
      reference: { messageId: "m1" },
      referencedMessage: { author: { id: "12345" } },
      content: "",
    });
    await handler(msg);
    assert.strictEqual(mockRunAIInterpret.mock.calls.length, 0);
  });

  test("reply to bot keeps full prompt (no trigger-chopping)", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "chat", reply: "Lanjut!" });
    const msg = makeMessage({
      type: 18,
      reference: { messageId: "m1" },
      referencedMessage: { author: { id: "12345" } },
      content: "resume",
    });
    await handler(msg);
    assert.strictEqual(mockRunAIInterpret.mock.calls.length, 1);
    assert.strictEqual(mockRunAIInterpret.mock.calls[0][1], "resume");
  });

  test("trigger word still stripped from prompt", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "chat", reply: "Lanjut!" });
    const msg = makeMessage({ content: "mona resume" });
    await handler(msg);
    assert.strictEqual(mockRunAIInterpret.mock.calls.length, 1);
    assert.strictEqual(mockRunAIInterpret.mock.calls[0][1], "resume");
  });

  function makeVoiceMsg(overrides: any = {}) {
    return makeMessage({ member: { displayName: "User", voice: { channel: { id: "vc1", rtcRegion: null } } }, ...overrides });
  }

  function makePlayer(overrides: any = {}) {
    return {
      playing: false,
      paused: false,
      connect: vi.fn().mockResolvedValue(undefined),
      play: vi.fn().mockResolvedValue(undefined),
      stopPlaying: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue({ tracks: [{ info: { title: "Ray", uri: "https://open.spotify.com/track/1" } }] }),
      ...overrides,
    };
  }

  test("changed-to embed uses markdown link when uri present", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "correct_playlist", keyword: "Ray" });
    const player = makePlayer();
    mockGetLavalink.mockReturnValue({ players: new Map(), createPlayer: vi.fn().mockReturnValue(player) });
    mockGetEngineM.mockReturnValue({ player: null });
    const msg = makeVoiceMsg({ content: "<@12345> bukan itu, mainkan Ray" });
    await handler(msg);
    const desc = (msg.channel.send.mock.calls[0][0].embeds[0] as any).setDescription.mock.calls[0][0];
    assert.strictEqual(desc, "Changed to [Ray](https://open.spotify.com/track/1)");
  });

  test("changed-to embed falls back to bold title when uri missing", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "correct_playlist", keyword: "Ray" });
    const player = makePlayer({ search: vi.fn().mockResolvedValue({ tracks: [{ info: { title: "Ray" } }] }) });
    mockGetLavalink.mockReturnValue({ players: new Map(), createPlayer: vi.fn().mockReturnValue(player) });
    mockGetEngineM.mockReturnValue({ player: null });
    const msg = makeVoiceMsg({ content: "<@12345> bukan itu, mainkan Ray" });
    await handler(msg);
    const desc = (msg.channel.send.mock.calls[0][0].embeds[0] as any).setDescription.mock.calls[0][0];
    assert.strictEqual(desc, "Changed to **Ray**");
  });

  test("pause confirmation is AI-generated without memory path", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "pause" });
    mockRunAIAskFresh.mockResolvedValue("Dipause dulu ya ⏸️");
    mockGetEngineM.mockReturnValue({ player: { volume: 80 } });
    mockPause.mockResolvedValue(true);
    const msg = makeVoiceMsg({ content: "<@12345> pause" });
    await handler(msg);
    assert.strictEqual(mockRunAIAskFresh.mock.calls.length, 1);
    assert.strictEqual(mockRunAIAsk.mock.calls.length, 0);
    assert.ok(mockRunAIAskFresh.mock.calls[0][1].toLowerCase().includes("paused"));
    assert.strictEqual(mockRunAIAskFresh.mock.calls[0][3].maxTokens, 64);
    assert.strictEqual(mockRunAIAskFresh.mock.calls[0][3].temperature, 0.2);
    const desc = (msg.channel.send.mock.calls[0][0].embeds[0] as any).setDescription.mock.calls[0][0];
    assert.strictEqual(desc, "Dipause dulu ya ⏸️");
  });

  test("pause confirmation only uses first line of AI reply", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "pause" });
    mockRunAIAskFresh.mockResolvedValue("Oke deh, santai dulu.\n\nPenjelasan panjang yang tidak boleh ikut terkirim...");
    mockGetEngineM.mockReturnValue({ player: { volume: 80 } });
    mockPause.mockResolvedValue(true);
    const msg = makeVoiceMsg({ content: "<@12345> pause" });
    await handler(msg);
    const desc = (msg.channel.send.mock.calls[0][0].embeds[0] as any).setDescription.mock.calls[0][0];
    assert.strictEqual(desc, "Oke deh, santai dulu.");
  });

  test("pause confirmation falls back to pool phrase when AI fails", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "pause" });
    mockRunAIAskFresh.mockRejectedValue(new Error("timeout"));
    mockGetEngineM.mockReturnValue({ player: { volume: 80 } });
    mockPause.mockResolvedValue(true);
    const msg = makeVoiceMsg({ content: "<@12345> pause" });
    await handler(msg);
    const pool = ["Dipause dulu ya ⏸️", "Oke, dijeda dulu. Lanjut kapan-kapan!", "Paused — lagunya stay di situ."];
    const desc = (msg.channel.send.mock.calls[0][0].embeds[0] as any).setDescription.mock.calls[0][0];
    assert.ok(pool.includes(desc), `unexpected fallback: ${desc}`);
  });

  test("resume while already playing replies humanely without calling resume", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "resume" });
    mockRunAIAskFresh.mockResolvedValue("Lagi jalan kok!");
    mockGetEngineM.mockReturnValue({ player: { playing: true, paused: false } });
    const msg = makeVoiceMsg({ content: "<@12345> resume" });
    await handler(msg);
    assert.strictEqual(mockResume.mock.calls.length, 0);
    assert.strictEqual(mockRunAIAskFresh.mock.calls.length, 1);
    assert.ok(mockRunAIAskFresh.mock.calls[0][1].includes("Already playing"));
  });

  test("resume with nothing paused replies humanely instead of Failed to resume", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "resume" });
    mockRunAIAskFresh.mockResolvedValue("Nggak ada yang di-pause.");
    mockGetEngineM.mockReturnValue({ player: { playing: false, paused: false } });
    mockResume.mockResolvedValue(false);
    const msg = makeVoiceMsg({ content: "<@12345> resume" });
    await handler(msg);
    assert.strictEqual(mockRunAIAskFresh.mock.calls.length, 1);
    assert.ok(mockRunAIAskFresh.mock.calls[0][1].includes("Nothing is paused"));
    const desc = (msg.channel.send.mock.calls[0][0].embeds[0] as any).setDescription.mock.calls[0][0];
    assert.strictEqual(desc, "Nggak ada yang di-pause.");
  });

  test("pause while already paused replies humanely without calling pause", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "pause" });
    mockRunAIAskFresh.mockResolvedValue("Udah di-pause kok ⏸️");
    mockGetEngineM.mockReturnValue({ player: { paused: true } });
    const msg = makeVoiceMsg({ content: "<@12345> pause" });
    await handler(msg);
    assert.strictEqual(mockPause.mock.calls.length, 0);
    assert.ok(mockRunAIAskFresh.mock.calls[0][1].includes("Already paused"));
  });

  test("stop confirmation uses natural summary", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "stop" });
    mockRunAIAskFresh.mockResolvedValue("Udah, beres! 👋");
    mockGetEngineM.mockReturnValue({ player: { playing: true, paused: false } });
    const msg = makeVoiceMsg({ content: "<@12345> stop" });
    await handler(msg);
    assert.strictEqual(mockStop.mock.calls.length, 1);
    assert.strictEqual(mockRunAIAskFresh.mock.calls[0][1], "Stopped the music.");
  });

  test("chat path persona knows playback state", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "chat" });
    mockRunAIAsk.mockResolvedValue("Sip!");
    mockGetEngineM.mockReturnValue({ player: { playing: true, paused: true } });
    const msg = makeVoiceMsg({ content: "<@12345> lagunya dipause ya?" });
    await handler(msg);
    assert.strictEqual(mockRunAIAsk.mock.calls.length, 1);
    const sysPrompt = mockRunAIAsk.mock.calls[0][2];
    assert.ok(sysPrompt.includes("PAUSED"), `persona missing paused state: ${sysPrompt}`);
  });

  test("chat path persona knows nothing playing", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "chat" });
    mockRunAIAsk.mockResolvedValue("Sip!");
    mockGetEngineM.mockReturnValue({ player: null });
    const msg = makeVoiceMsg({ content: "<@12345> lagi ada lagu?" });
    await handler(msg);
    assert.strictEqual(mockRunAIAsk.mock.calls.length, 1);
    const sysPrompt = mockRunAIAsk.mock.calls[0][2];
    assert.ok(sysPrompt.includes("Nothing is playing"), `persona missing stopped state: ${sysPrompt}`);
  });

  test("confirmReply falls back to template when AI regurgitates instructions", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "stop" });
    mockRunAIAskFresh.mockResolvedValue('The user wants me to respond as Paperplane, a friendly Discord music bot. The context says the music was paused ("Kartonyono Medot Janji"...');
    mockGetEngineM.mockReturnValue({ player: { playing: true, paused: false } });
    const msg = makeVoiceMsg({ content: "<@12345> stop" });
    await handler(msg);
    const desc = (msg.channel.send.mock.calls[0][0].embeds[0] as any).setDescription.mock.calls[0][0];
    const stoppedPool = [
      "Oke, musik dihentikan. See you next request! 👋",
      "Udah kuhentikan. Sampai request berikutnya!",
      "Stopped — beres dulu, sisanya aman.",
    ];
    assert.ok(stoppedPool.includes(desc), `expected pool phrase, got: ${desc}`);
  });

  test("playlist confirmation is AI-generated with track context", async () => {
    mockRunAIInterpret.mockResolvedValue({ type: "playlist", songs: ["lagu a", "lagu b"] });
    const player = makePlayer({ search: vi.fn().mockResolvedValue({ tracks: [{ info: { title: "Lagu A", uri: "https://x/1" } }] }) });
    mockGetLavalink.mockReturnValue({ players: new Map(), createPlayer: vi.fn().mockReturnValue(player) });
    mockGetEngineM.mockReturnValue({ player: null });
    mockRunAIAskFresh.mockResolvedValue("2 lagu siap! 🎶");
    const msg = makeVoiceMsg({ content: "<@12345> kasih saya didi kempot full album" });
    await handler(msg);
    assert.strictEqual(mockRunAIAskFresh.mock.calls.length, 1);
    const summary = mockRunAIAskFresh.mock.calls[0][1];
    assert.ok(summary.includes("2 tracks"), `summary missing count: ${summary}`);
    assert.ok(summary.includes("Lagu A"), `summary missing first track: ${summary}`);
    const desc = (msg.channel.send.mock.calls[0][0].embeds[0] as any).setDescription.mock.calls[0][0];
    assert.strictEqual(desc, "2 lagu siap! 🎶");
  });
});