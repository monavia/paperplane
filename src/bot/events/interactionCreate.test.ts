import { describe, test, vi, beforeEach } from "vitest";
import assert from "node:assert";

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock("../core/utils/Logger.js", () => ({ default: mockLogger }));

const mockIsLavalinkReady = vi.fn(() => true);
vi.mock("../music/services/MusicService.js", () => ({ isLavalinkReady: mockIsLavalinkReady }));

vi.mock("../ui/embeds/ErrorEmbed.js", () => ({ build: vi.fn((msg: string) => ({ description: msg })) }));

const mockCooldownCheck = vi.fn(() => true);
const mockCooldownSet = vi.fn();
const mockCooldownGetRemaining = vi.fn(() => 5000);
vi.mock("../core/utils/CooldownManager.js", () => ({
  default: { check: mockCooldownCheck, set: mockCooldownSet, getRemaining: mockCooldownGetRemaining },
}));

const mockIncCommandsExecuted = vi.fn();
const mockObserveCommandLatency = vi.fn();
vi.mock("../telemetry/MetricsCollector.js", () => ({
  incCommandsExecuted: mockIncCommandsExecuted,
  observeCommandLatency: mockObserveCommandLatency,
}));

describe("interactionCreate", () => {
  const listeners = new Map<string, Function>();
  const mockExecute = vi.fn();
  const slashCommands = new Map<string, any>();
  const mockClient: any = {
    on(event: string, handler: Function) { listeners.set(event, handler); },
    slashCommands,
  };
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    slashCommands.clear();
    listeners.clear();
    mockIsLavalinkReady.mockReturnValue(true);
    mockCooldownCheck.mockReturnValue(true);
    const mod = await import("./interactionCreate.js");
    mod.start(mockClient);
    handler = listeners.get("interactionCreate")!;
  });

  function makeInteraction(overrides: any = {}) {
    const retPromise = { catch: vi.fn() };
    return {
      isChatInputCommand: vi.fn().mockReturnValue(true),

      commandName: "ping",
      user: { id: "user1" },
      reply: vi.fn().mockReturnValue(retPromise),
      deferred: false,
      replied: false,
      editReply: vi.fn().mockReturnValue(retPromise),
      ...overrides,
    };
  }

  test("ignores non-command interactions", async () => {
    const interaction = makeInteraction({ isChatInputCommand: vi.fn().mockReturnValue(false) });
    await handler(interaction);
    assert.strictEqual(mockExecute.mock.calls.length, 0);
  });

  test("ignores unknown commands", async () => {
    const interaction = makeInteraction({ commandName: "unknown" });
    await handler(interaction);
    assert.strictEqual(mockExecute.mock.calls.length, 0);
  });

  test("executes registered command", async () => {
    slashCommands.set("ping", { execute: mockExecute });
    mockExecute.mockResolvedValue(undefined);
    const interaction = makeInteraction();
    await handler(interaction);
    assert.strictEqual(mockExecute.mock.calls.length, 1);
    assert.strictEqual(mockIncCommandsExecuted.mock.calls.length, 1);
    assert.strictEqual(mockObserveCommandLatency.mock.calls.length, 1);
  });

  test("blocks music commands when Lavalink down", async () => {
    mockIsLavalinkReady.mockReturnValue(false);
    slashCommands.set("play", { execute: mockExecute });
    const interaction = makeInteraction({ commandName: "play" });
    await handler(interaction);
    assert.strictEqual(mockExecute.mock.calls.length, 0);
    assert.strictEqual(interaction.reply.mock.calls.length, 1);
  });

  test("non-music commands pass when Lavalink down", async () => {
    mockIsLavalinkReady.mockReturnValue(false);
    slashCommands.set("ping", { execute: mockExecute });
    mockExecute.mockResolvedValue(undefined);
    const interaction = makeInteraction();
    await handler(interaction);
    assert.strictEqual(mockExecute.mock.calls.length, 1);
  });

  test("blocks command on cooldown", async () => {
    mockCooldownCheck
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    slashCommands.set("ping", { execute: mockExecute });
    mockExecute.mockResolvedValue(undefined);

    const interaction1 = makeInteraction();
    const interaction2 = makeInteraction();

    await handler(interaction1);
    await handler(interaction2);

    assert.strictEqual(mockExecute.mock.calls.length, 1);
    assert.strictEqual(interaction2.reply.mock.calls.length, 1);
  });

  test("handles exec error gracefully with deferred editReply", async () => {
    slashCommands.set("ping", { execute: mockExecute });
    mockExecute.mockRejectedValue(new Error("boom"));
    const interaction = makeInteraction({ deferred: true });
    await handler(interaction);
    assert.strictEqual(interaction.editReply.mock.calls.length, 1);
    assert.strictEqual(mockIncCommandsExecuted.mock.calls.filter((c: any) => c[0].status === "failure").length, 1);
  });

  test("replies with error when not deferred", async () => {
    slashCommands.set("ping", { execute: mockExecute });
    mockExecute.mockRejectedValue(new Error("boom"));
    const interaction = makeInteraction();
    await handler(interaction);
    assert.strictEqual(interaction.reply.mock.calls.length, 1);
  });
});