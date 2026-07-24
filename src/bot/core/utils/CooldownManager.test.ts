import { describe, test, beforeAll } from "vitest";
import assert from "node:assert";
import cooldown from "./CooldownManager.js";

const advance = (ms: number) => new Promise(r => setTimeout(r, ms));

describe("CooldownManager", () => {
  beforeAll(() => cooldown.reset("all"));

  test("allows first use immediately", () => assert.ok(cooldown.check("user1", "play")));
  test("blocks second use within cooldown", () => { cooldown.set("user2", "skip"); assert.ok(!cooldown.check("user2", "skip", 100)); });
  test("returns remaining time", () => { cooldown.set("user3", "stop"); assert.ok(cooldown.getRemaining("user3", "stop", 5000) > 0); });
  test("allows after cooldown expires", { timeout: 500 }, async () => {
    cooldown.set("user4", "pause"); await advance(80);
    assert.ok(!cooldown.check("user4", "pause", 100)); await advance(40);
    assert.ok(cooldown.check("user4", "pause", 100));
  });
  test("tracks usage count", () => {
    cooldown.reset("usage"); cooldown.set("usage", "cmd"); cooldown.set("usage", "cmd");
    assert.strictEqual(cooldown.getUses("usage", "cmd"), 2);
  });
  test("reset single command", () => {
    cooldown.set("user5", "cmd1"); cooldown.set("user5", "cmd2");
    cooldown.reset("user5", "cmd1");
    assert.ok(cooldown.check("user5", "cmd1"));
    assert.ok(!cooldown.check("user5", "cmd2", 100));
  });
  test("reset all commands for user", () => {
    cooldown.set("user6", "a"); cooldown.set("user6", "b"); cooldown.reset("user6");
    assert.ok(cooldown.check("user6", "a")); assert.ok(cooldown.check("user6", "b"));
  });
  test("different users have independent cooldowns", () => {
    cooldown.set("ia", "play"); cooldown.set("ib", "play");
    assert.ok(!cooldown.check("ia", "play", 100)); assert.ok(!cooldown.check("ib", "play", 100));
  });
  test("different commands have independent cooldowns", () => {
    cooldown.set("u7", "play");
    assert.ok(!cooldown.check("u7", "play", 100)); assert.ok(cooldown.check("u7", "skip"));
  });
});
