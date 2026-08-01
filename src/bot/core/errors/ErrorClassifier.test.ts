import { describe, test } from "vitest";
import assert from "node:assert";
import { UserError, classifyError } from "./ErrorClassifier.js";

function discordErr(code: number, status: number) {
  return Object.assign(new Error(`Discord error ${code}`), { name: "DiscordAPIError", code, status });
}

describe("ErrorClassifier", () => {
  test("UserError classified as user with exact message", () => {
    const cls = classifyError(new UserError("You must be in a voice channel."));
    assert.strictEqual(cls.kind, "user");
    assert.strictEqual(cls.message, "You must be in a voice channel.");
  });

  test("DiscordAPIError 50013 (missing permissions) → discord + friendly", () => {
    const cls = classifyError(discordErr(50013, 403));
    assert.strictEqual(cls.kind, "discord");
    assert.match(cls.message, /permission/i);
  });

  test("DiscordAPIError 429 (rate limit) → discord + friendly", () => {
    const cls = classifyError(discordErr(429, 429));
    assert.strictEqual(cls.kind, "discord");
    assert.match(cls.message, /rate-limit/i);
  });

  test("DiscordAPIError unknown code → discord generic", () => {
    const cls = classifyError(discordErr(99999, 500));
    assert.strictEqual(cls.kind, "discord");
  });

  test("plain error → system generic (no internals leaked)", () => {
    const cls = classifyError(new Error("MongoNetworkError: connection refused at 10.0.0.5:27017"));
    assert.strictEqual(cls.kind, "system");
    assert.ok(!cls.message.includes("MongoNetworkError"));
    assert.ok(!cls.message.includes("27017"));
  });

  test("null / non-error input does not throw", () => {
    assert.strictEqual(classifyError(null).kind, "system");
    assert.strictEqual(classifyError(undefined).kind, "system");
    assert.strictEqual(classifyError("string").kind, "system");
  });
});
