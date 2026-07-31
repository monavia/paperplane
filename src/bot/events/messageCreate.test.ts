import { describe, test, vi, beforeEach } from "vitest";
import assert from "node:assert";

const mockEmbedBuilder = vi.fn().mockReturnValue({
  setDescription: vi.fn().mockReturnThis(),
  setColor: vi.fn().mockReturnThis(),
  setTitle: vi.fn().mockReturnThis(),
  setAuthor: vi.fn().mockReturnThis(),
});
vi.mock("discord.js", () => ({ EmbedBuilder: mockEmbedBuilder, MessageType: { Reply: 18 } }));

const mockConfigTrigger = "mona";
vi.mock("../config/bot.js", () => ({ default: { trigger: mockConfigTrigger, token: "", prefix: "-" } }));

const mockRunAIAsk = vi.fn();
const mockRunAIInterpret = vi.fn();
vi.mock("../ai/services/AITaskQueue.js", () => ({ runAIAsk: mockRunAIAsk, runAIInterpret: mockRunAIInterpret }));

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
vi.mock("../music/services/MusicService.js", () => ({
  isLavalinkReady: mockIsLavalinkReady,
  getEngine: mockGetEngineM,
  skip: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
}));

vi.mock("../music/services/QueueService.js", () => ({ getQueue: vi.fn() }));

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

vi.mock("../music/engine/lavalink.js", () => ({ get: vi.fn() }));
vi.mock("../music/services/TextChannelStore.js", () => ({ setTextChannelId: vi.fn() }));
vi.mock("../core/state/QueueLock.js", () => ({ withQueueLock: vi.fn() }));
vi.mock("../music/engine/musicEvents.js", () => ({ markTrackStartSuppressed: vi.fn(), markStopDisconnect: vi.fn() }));
vi.mock("../music/services/StateService.js", () => ({ saveState: vi.fn() }));
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
});