import { describe, test, vi, beforeEach } from "vitest";
import assert from "node:assert";

vi.mock("../music/events/EventBus.js", () => ({
  on: vi.fn(() => vi.fn()),
  emit: vi.fn(),
}));

describe("MetricsCollector", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("initial zeros", async () => {
    const mod = await import("./MetricsCollector.js");
    const m = mod.getMetrics();
    assert.strictEqual(m.tracksPlayed, 0);
    assert.strictEqual(m.tracksFailed, 0);
    assert.strictEqual(m.commandsExecuted, 0);
    assert.strictEqual(m.guildCount, 0);
    assert.strictEqual(m.voiceConnections, 0);
    assert.strictEqual(m.activePlayers, 0);
    assert.strictEqual(m.activeGuilds, 0);
    assert.strictEqual(m.connectedGuilds, 0);
    assert.strictEqual(m.rateLimitBlocked, 0);
    assert.strictEqual(m.rateLimitAllowed, 0);
    assert.strictEqual(m.lavalinkNodesOnline, 0);
    assert.strictEqual(m.eventLoopLag, 0);
    assert.strictEqual(m.cacheHit, 0);
    assert.strictEqual(m.cacheMiss, 0);
  });

  test("incTracksPlayed", async () => {
    const mod = await import("./MetricsCollector.js");
    mod.incTracksPlayed();
    mod.incTracksPlayed();
    assert.strictEqual(mod.getMetrics().tracksPlayed, 2);
  });

  test("incTracksPlayed with labels", async () => {
    const mod = await import("./MetricsCollector.js");
    mod.incTracksPlayed({ guild: "g1", source: "youtube" });
    mod.incTracksPlayed({ guild: "g1", source: "youtube" });
    mod.incTracksPlayed({ guild: "g2", source: "spotify" });
    const m = mod.getMetrics();
    assert.strictEqual(m.tracksPlayed, 3);
    assert.strictEqual(m.tracksPlayedByLabel["g1/youtube"], 2);
    assert.strictEqual(m.tracksPlayedByLabel["g2/spotify"], 1);
  });

  test("incTracksFailed", async () => {
    const mod = await import("./MetricsCollector.js");
    mod.incTracksFailed();
    assert.strictEqual(mod.getMetrics().tracksFailed, 1);
  });

  test("incCommandsExecuted", async () => {
    const mod = await import("./MetricsCollector.js");
    mod.incCommandsExecuted();
    mod.incCommandsExecuted();
    mod.incCommandsExecuted();
    assert.strictEqual(mod.getMetrics().commandsExecuted, 3);
  });

  test("setGuildCount", async () => {
    const mod = await import("./MetricsCollector.js");
    mod.setGuildCount(5);
    assert.strictEqual(mod.getMetrics().guildCount, 5);
  });

  test("setVoiceConnections", async () => {
    const mod = await import("./MetricsCollector.js");
    mod.setVoiceConnections(3);
    assert.strictEqual(mod.getMetrics().voiceConnections, 3);
  });

  test("setActivePlayers", async () => {
    const mod = await import("./MetricsCollector.js");
    mod.setActivePlayers(2);
    assert.strictEqual(mod.getMetrics().activePlayers, 2);
  });

  test("setLavalink node metrics", async () => {
    const mod = await import("./MetricsCollector.js");
    mod.setLavalinkNodePlayers("node1", 5);
    mod.setLavalinkNodePenalty("node1", 120);
    mod.setLavalinkNodeLatency("node1", 42);
    mod.incLavalinkNodeDisconnects("node1");
    mod.incLavalinkNodeDisconnects("node1");

    const m = mod.getMetrics();
    assert.strictEqual(m.lavalinkNodePlayers["node1"], 5);
    assert.strictEqual(m.lavalinkNodePenalty["node1"], 120);
    assert.strictEqual(m.lavalinkNodeLatency["node1"], 42);
    assert.strictEqual(m.lavalinkNodeDisconnects, 2);
    assert.strictEqual(m.lavalinkNodeDisconnectsByLabel["node1"], 2);
  });

  test("incCacheHit and incCacheMiss", async () => {
    const mod = await import("./MetricsCollector.js");
    mod.incCacheHit("guilds");
    mod.incCacheHit("guilds");
    mod.incCacheMiss("users");
    const m = mod.getMetrics();
    assert.strictEqual(m.cacheHit, 2);
    assert.strictEqual(m.cacheHitByLabel["guilds"], 2);
    assert.strictEqual(m.cacheMiss, 1);
    assert.strictEqual(m.cacheMissByLabel["users"], 1);
  });

  test("getMetrics memory info", async () => {
    const mod = await import("./MetricsCollector.js");
    const m = mod.getMetrics();
    assert.ok(m.memory.rss > 0);
    assert.ok(m.memory.heapUsed > 0);
    assert.ok(m.memory.heapTotal > 0);
  });
});
