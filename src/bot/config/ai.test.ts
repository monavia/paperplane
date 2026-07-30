import { describe, test, beforeEach, vi } from "vitest";
import assert from "node:assert";

vi.mock("dotenv/config", () => ({}));

describe("AI config", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test("defaults when env empty", async () => {
    const cfg = (await import("./ai.js")).default as any;
    assert.strictEqual(cfg.apiKey, "");
    assert.strictEqual(cfg.model, "qwen2.5:7b");
    assert.strictEqual(cfg.baseUrl, "https://openrouter.ai/api/v1");
    assert.strictEqual(cfg.temperature, 0.7);
    assert.strictEqual(cfg.maxTokens, 2048);
  });

  test("reads AI_* env vars", async () => {
    vi.stubEnv("AI_API_KEY", "ai-key-123");
    vi.stubEnv("AI_MODEL", "gpt-4");
    vi.stubEnv("AI_BASE_URL", "https://custom.ai/v1");
    vi.stubEnv("AI_TEMPERATURE", "1.2");
    vi.stubEnv("AI_MAX_TOKENS", "4096");

    const cfg = (await import("./ai.js")).default as any;
    assert.strictEqual(cfg.apiKey, "ai-key-123");
    assert.strictEqual(cfg.model, "gpt-4");
    assert.strictEqual(cfg.baseUrl, "https://custom.ai/v1");
    assert.strictEqual(cfg.temperature, 1.2);
    assert.strictEqual(cfg.maxTokens, 4096);
  });

  test("OPENROUTER_* fallback when AI_* not set", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "or-key-456");
    vi.stubEnv("OPENROUTER_MODEL", "claude-3");

    const cfg = (await import("./ai.js")).default as any;
    assert.strictEqual(cfg.apiKey, "or-key-456");
    assert.strictEqual(cfg.model, "claude-3");
  });

  test("AI_* takes priority over OPENROUTER_*", async () => {
    vi.stubEnv("AI_API_KEY", "ai-key");
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");
    vi.stubEnv("AI_MODEL", "ai-model");
    vi.stubEnv("OPENROUTER_MODEL", "or-model");

    const cfg = (await import("./ai.js")).default as any;
    assert.strictEqual(cfg.apiKey, "ai-key");
    assert.strictEqual(cfg.model, "ai-model");
  });
});
