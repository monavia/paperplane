import { describe, test, vi, beforeEach } from "vitest";
import assert from "node:assert";

const { mockGetMemoryContext } = vi.hoisted(() => ({
  mockGetMemoryContext: vi.fn().mockResolvedValue(""),
}));
vi.mock("../services/MemoryService.js", () => ({
  default: { getMemoryContext: mockGetMemoryContext, saveMemory: vi.fn() },
}));

import PromptBuilder from "./PromptBuilder.js";
import { PERSONA } from "../config/persona.js";

const noHistory = { getHistory: async () => [] };

describe("PromptBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMemoryContext.mockResolvedValue("");
  });

  test("uses persona when no system override", async () => {
    const messages = await PromptBuilder.build("u1", "halo", undefined, noHistory);
    assert.strictEqual(messages[0].role, "system");
    assert.strictEqual(messages[0].content, PERSONA);
    assert.ok(!messages[0].content.includes("Answer concisely"));
  });

  test("uses system override when provided", async () => {
    const messages = await PromptBuilder.build("u1", "halo", "CUSTOM SYS", noHistory);
    assert.strictEqual(messages[0].content, "CUSTOM SYS");
  });

  test("injects long-term memory context", async () => {
    mockGetMemoryContext.mockResolvedValue("likes rock music");
    const messages = await PromptBuilder.build("u1", "halo", undefined, noHistory);
    const memoryMsg = messages.find((m: any) => m.role === "system" && m.content.includes("likes rock music"));
    assert.ok(memoryMsg, "memory context should be injected");
  });

  test("does not inject memory context when empty", async () => {
    const messages = await PromptBuilder.build("u1", "halo", undefined, noHistory);
    assert.strictEqual(messages.length, 2);
  });

  test("appends history then prompt", async () => {
    const memory = { getHistory: async () => [{ user: "hai", assistant: "hai juga" }] };
    const messages = await PromptBuilder.build("u1", "lagu apa?", undefined, memory);
    assert.strictEqual(messages[messages.length - 3].role, "user");
    assert.strictEqual(messages[messages.length - 3].content, "hai");
    assert.strictEqual(messages[messages.length - 2].role, "assistant");
    assert.strictEqual(messages[messages.length - 2].content, "hai juga");
    assert.strictEqual(messages[messages.length - 1].content, "lagu apa?");
  });
});
