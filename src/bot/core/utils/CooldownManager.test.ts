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

describe("CooldownManager edge cases", () => {
  test("getUses returns 0 for unknown", () => {
    assert.strictEqual(cooldown.getUses("ghost", "cmd"), 0);
  });

  test("getRemaining returns 0 when no cooldown", () => {
    assert.strictEqual(cooldown.getRemaining("nonexistent", "cmd"), 0);
  });

  test("getRemaining returns 0 after expiry", { timeout: 500 }, async () => {
    cooldown.set("expireUser", "cmd");
    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(cooldown.getRemaining("expireUser", "cmd", 10), 0);
  });

  test("reset non-existent user doesn't throw", () => {
    cooldown.reset("noSuchUser");
    cooldown.reset("noSuchUser", "someCmd");
  });

  test("size reflects total entries", () => {
    cooldown.reset("sizeTestA");
    cooldown.reset("sizeTestB");
    cooldown.set("sizeTestA", "x");
    cooldown.set("sizeTestB", "y");
    assert.ok(cooldown.size() >= 2);
  });

  test("concurrent rapid set+check doesn't throw", () => {
    for (let i = 0; i < 20; i++) {
      cooldown.set(`rapid${i}`, "cmd");
      cooldown.check(`rapid${i}`, "cmd");
    }
  });

  test("set 50 entries then verify size", () => {
    cooldown.reset("bulk");
    for (let i = 0; i < 50; i++) {
      cooldown.set("bulk", `cmd${i}`);
    }
    assert.strictEqual(cooldown.getUses("bulk", "cmd0"), 1);
    assert.strictEqual(cooldown.getUses("bulk", "cmd49"), 1);
  });

  test("check after exact cooldown boundary", { timeout: 500 }, async () => {
    cooldown.set("boundaryUser", "cmd");
    await new Promise(r => setTimeout(r, 30));
    assert.ok(cooldown.check("boundaryUser", "cmd", 20));
    assert.ok(!cooldown.check("boundaryUser", "cmd", 100));
  });
});
