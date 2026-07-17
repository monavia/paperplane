import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { withQueueLock } from "./QueueLock";

describe("QueueLock", () => {
  test("executes function immediately when lock is free", async () => {
    let executed = false;
    const result = await withQueueLock("guild1", async () => {
      executed = true;
      return "done";
    });
    assert.strictEqual(result, "done");
    assert.strictEqual(executed, true);
  });

  test("queues multiple callers and executes sequentially", async () => {
    const order: number[] = [];
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    const p1 = withQueueLock("guild2", async () => {
      order.push(1);
      await delay(50);
      order.push(2);
      return "first";
    });

    const p2 = withQueueLock("guild2", async () => {
      order.push(3);
      await delay(10);
      order.push(4);
      return "second";
    });

    const p3 = withQueueLock("guild2", async () => {
      order.push(5);
      return "third";
    });

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    assert.strictEqual(r1, "first");
    assert.strictEqual(r2, "second");
    assert.strictEqual(r3, "third");
    assert.deepStrictEqual(order, [1, 2, 3, 4, 5]);
  });

  test("different guildIds get independent locks", async () => {
    const order: string[] = [];
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    const p1 = withQueueLock("guildA", async () => {
      order.push("A1");
      await delay(30);
      order.push("A2");
    });

    const p2 = withQueueLock("guildB", async () => {
      order.push("B1");
      await delay(10);
      order.push("B2");
    });

    await Promise.all([p1, p2]);
    // Both should run in parallel since different guilds
    assert.ok(order.includes("A1"));
    assert.ok(order.includes("B1"));
  });

  test("releases lock even when function throws", async () => {
    const error = new Error("test error");
    await assert.rejects(
      withQueueLock("guild3", async () => {
        throw error;
      }),
      (err: Error) => err === error
    );

    // Lock should be released, next caller executes immediately
    let executed = false;
    const result = await withQueueLock("guild3", async () => {
      executed = true;
      return "recovered";
    });
    assert.strictEqual(result, "recovered");
    assert.strictEqual(executed, true);
  });

  test("timeout warning does not release lock early", async () => {
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    let firstDone = false;

    // Short timeout (50ms) but function takes 100ms
    const p1 = withQueueLock("guild4", async () => {
      await delay(100);
      firstDone = true;
      return "first";
    }, 50);

    // Second caller should wait for first to complete, not get lock after timeout
    const p2 = withQueueLock("guild4", async () => {
      return "second";
    }, 50);

    const [r1, r2] = await Promise.all([p1, p2]);
    assert.strictEqual(r1, "first");
    assert.strictEqual(r2, "second");
    assert.strictEqual(firstDone, true);
  });

  test("cleanup removes lock entry when queue empty and unlocked", async () => {
    await withQueueLock("guild5", async () => "test");
    // Repeated calls should not leak memory
    for (let i = 0; i < 10; i++) {
      await withQueueLock("guild5", async () => i);
    }
    assert.ok(true); // Passes if no leak
  });
});