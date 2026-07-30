import { describe, test, beforeEach, vi } from "vitest";
import assert from "node:assert";

vi.mock("dotenv/config", () => ({}));

describe("bot config", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test("defaults when env empty", async () => {
    const cfg = (await import("./bot.js")).default as any;
    assert.strictEqual(cfg.token, "");
    assert.strictEqual(cfg.clientId, "");
    assert.strictEqual(cfg.prefix, "-");
    assert.strictEqual(cfg.trigger, "mona");
    assert.strictEqual(cfg.apiPort, 3001);
    assert.strictEqual(cfg.apiHost, "0.0.0.0");
    assert.strictEqual(cfg.deployCommands, true);
    assert.strictEqual(cfg.maxQueue, 150);
    assert.strictEqual(cfg.maxSpotify, 100);
    assert.strictEqual(cfg.spotifyBatch, 20);
    assert.strictEqual(cfg.apiRateLimit, 1000);
    assert.strictEqual(cfg.redisUrl, "redis://localhost:6379");
    assert.strictEqual(cfg.redisPrefix, "paperplane:");
    assert.strictEqual(cfg.redisEnabled, true);
  });

  test("reads env vars correctly", async () => {
    vi.stubEnv("DISCORD_TOKEN", "tok123");
    vi.stubEnv("CLIENT_ID", "cid456");
    vi.stubEnv("PREFIX", "!");
    vi.stubEnv("TRIGGER", "bot");
    vi.stubEnv("API_PORT", "4000");
    vi.stubEnv("API_HOST", "10.0.0.1");
    vi.stubEnv("DEPLOY_COMMANDS", "true");
    vi.stubEnv("MAX_QUEUE", "300");
    vi.stubEnv("MAX_SPOTIFY", "50");
    vi.stubEnv("SPOTIFY_BATCH", "10");
    vi.stubEnv("API_RATE_LIMIT", "500");
    vi.stubEnv("REDIS_URL", "redis://10.0.0.1:6379");
    vi.stubEnv("REDIS_PREFIX", "myapp:");
    vi.stubEnv("REDIS_ENABLED", "false");

    const cfg = (await import("./bot.js")).default as any;
    assert.strictEqual(cfg.token, "tok123");
    assert.strictEqual(cfg.clientId, "cid456");
    assert.strictEqual(cfg.prefix, "!");
    assert.strictEqual(cfg.trigger, "bot");
    assert.strictEqual(cfg.apiPort, 4000);
    assert.strictEqual(cfg.apiHost, "10.0.0.1");
    assert.strictEqual(cfg.deployCommands, true);
    assert.strictEqual(cfg.maxQueue, 300);
    assert.strictEqual(cfg.maxSpotify, 50);
    assert.strictEqual(cfg.spotifyBatch, 10);
    assert.strictEqual(cfg.apiRateLimit, 500);
    assert.strictEqual(cfg.redisUrl, "redis://10.0.0.1:6379");
    assert.strictEqual(cfg.redisPrefix, "myapp:");
    assert.strictEqual(cfg.redisEnabled, false);
  });

  test("trigger lowercased", async () => {
    vi.stubEnv("TRIGGER", "MONA");
    const cfg = (await import("./bot.js")).default as any;
    assert.strictEqual(cfg.trigger, "mona");
  });

  test("DEPLOY_COMMANDS false", async () => {
    vi.stubEnv("DEPLOY_COMMANDS", "false");
    const cfg = (await import("./bot.js")).default as any;
    assert.strictEqual(cfg.deployCommands, false);
  });

  test("BOT_API_PORT fallback", async () => {
    vi.stubEnv("BOT_API_PORT", "5000");
    const cfg = (await import("./bot.js")).default as any;
    assert.strictEqual(cfg.apiPort, 5000);
  });
});
