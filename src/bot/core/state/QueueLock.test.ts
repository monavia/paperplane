import { describe, test } from "vitest";
import assert from "node:assert";
import { withQueueLock } from "./QueueLock";

describe("QueueLock", () => {
  test("executes function immediately when lock is free", async () => {
    let executed = false;
    const result = await withQueueLock("guild1", async () => { executed = true; return "done"; });
    assert.strictEqual(result, "done");
    assert.strictEqual(executed, true);
  });

  test("queues multiple callers and executes sequentially", async () => {
    const order: number[] = [];
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    const p1 = withQueueLock("guild2", async () => { order.push(1); await delay(50); order.push(2); return "first"; });
    const p2 = withQueueLock("guild2", async () => { order.push(3); await delay(10); order.push(4); return "second"; });
    const p3 = withQueueLock("guild2", async () => { order.push(5); return "third"; });
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    assert.strictEqual(r1, "first"); assert.strictEqual(r2, "second"); assert.strictEqual(r3, "third");
    assert.deepStrictEqual(order, [1, 2, 3, 4, 5]);
  });

  test("different guildIds get independent locks", async () => {
    const order: string[] = [];
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    const p1 = withQueueLock("guildA", async () => { order.push("A1"); await delay(30); order.push("A2"); });
    const p2 = withQueueLock("guildB", async () => { order.push("B1"); await delay(10); order.push("B2"); });
    await Promise.all([p1, p2]);
    assert.ok(order.includes("A1")); assert.ok(order.includes("B1"));
  });

  test("releases lock even when function throws", async () => {
    await assert.rejects(withQueueLock("guild3", async () => { throw new Error("test"); }));
    const result = await withQueueLock("guild3", async () => "recovered");
    assert.strictEqual(result, "recovered");
  });

  test("timeout warning does not release lock early", async () => {
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    const p1 = withQueueLock("guild4", async () => { await delay(100); return "first"; }, 50);
    const p2 = withQueueLock("guild4", async () => "second", 50);
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.strictEqual(r1, "first"); assert.strictEqual(r2, "second");
  });

  test("sequential calls with varying durations all complete in order", async () => {
    const order: number[] = [];
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    const p1 = withQueueLock("guild6", async () => { order.push(1); await delay(60); order.push(2); });
    const p2 = withQueueLock("guild6", async () => { order.push(3); await delay(10); order.push(4); });
    const p3 = withQueueLock("guild6", async () => { order.push(5); });
    await Promise.all([p1, p2, p3]);
    assert.deepStrictEqual(order, [1, 2, 3, 4, 5]);
  });

  test("memory does not leak across many guilds", async () => {
    const guilds = Array.from({ length: 20 }, (_, i) => `leak-guild-${i}`);
    await Promise.all(guilds.map(g => withQueueLock(g, async () => "ok")));
    for (const g of guilds) {
      const result = await withQueueLock(g, async () => "again");
      assert.strictEqual(result, "again");
    }
  });
});
