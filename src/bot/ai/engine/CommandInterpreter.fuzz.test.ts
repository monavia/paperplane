import { describe, test } from "vitest";
import assert from "node:assert";
import CommandInterpreter from "./CommandInterpreter.js";

const ci = new CommandInterpreter();
const validTypes = ["help", "info", "nowplaying", "skip", "stop", "pause", "resume", "queue", "autoplay", "shuffle", "loop", "volume", "ping", "247", "clear", "recommend", "play", "prefix", "correct_playlist", "chat"];

describe("fuzz", () => {
  test("all ASCII printable single chars return valid type", () => {
    for (let i = 32; i <= 126; i++) {
      const result = ci.interpret(String.fromCharCode(i));
      assert.ok(validTypes.includes(result.type), `char ${i} (${String.fromCharCode(i)}) type ${result.type} not in valid types`);
    }
  });

  test("random long strings don't throw", () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789   !@#$%^&*()_+";
    for (const len of [10, 100, 1000, 5000]) {
      let s = "";
      for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
      assert.doesNotThrow(() => ci.interpret(s));
    }
  });

  test("unicode mixed inputs don't throw", () => {
    assert.doesNotThrow(() => ci.interpret("🎵🎶 hello 👋"));
    assert.doesNotThrow(() => ci.interpret("مرحبا كيف حالك"));
    assert.doesNotThrow(() => ci.interpret("你好世界"));
    assert.doesNotThrow(() => ci.interpret("こんにちは世界"));
    assert.doesNotThrow(() => ci.interpret("🎵 play lagu 🎵"));
  });

  test("sql injection patterns return chat", () => {
    assert.deepStrictEqual(ci.interpret("'; DROP TABLE users; --"), { type: "chat" });
    assert.deepStrictEqual(ci.interpret("' OR 1=1 --"), { type: "chat" });
    assert.deepStrictEqual(ci.interpret("'; SELECT * FROM users; --"), { type: "chat" });
    assert.deepStrictEqual(ci.interpret("\" OR \"1\"=\"1"), { type: "chat" });
  });

  test("all valid play prefixes work", () => {
    const prefixes = ["play", "p", "put on", "play me", "mainkan", "putar", "cari", "شغل", "شغِّل", "دندن"];
    for (const prefix of prefixes) {
      const result = ci.interpret(`${prefix} some song`);
      assert.strictEqual(result.type, "play", `prefix "${prefix}" should produce play`);
      assert.ok(typeof result.query === "string" && result.query.length > 0, `prefix "${prefix}" should have query`);
    }
  });

  test("all command prefixes validated", () => {
    const cases: [string, string][] = [
      ["help", "help"], ["bantuan", "help"],
      ["info", "info"],
      ["np", "nowplaying"],
      ["skip", "skip"], ["stop", "stop"],
      ["pause", "pause"], ["resume", "resume"],
      ["q", "queue"], ["autoplay", "autoplay"],
      ["shuffle", "shuffle"], ["loop", "loop"],
      ["247", "247"], ["clear", "clear"],
      ["ping", "ping"], ["volume", "volume"],
    ];
    for (const [input, expected] of cases) {
      assert.strictEqual(ci.interpret(input).type, expected, `"${input}" should be ${expected}`);
    }
  });
});
