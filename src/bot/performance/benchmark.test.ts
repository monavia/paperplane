import { describe, test, beforeEach } from "vitest";
import assert from "node:assert";
import QueueEngine from "../music/engine/QueueEngine.js";
import QueueStore from "../core/state/QueueStore.js";
import CooldownManager from "../core/utils/CooldownManager.js";
import state from "../core/state/StateManager.js";

function makeTrack(id: number) {
  return { info: { title: `Track ${id}`, author: "Artist", duration: 200000, uri: `https://example.com/track/${id}` } };
}

function elapsedMs(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

describe("QueueEngine benchmark", () => {
  beforeEach(() => {
    state.queues.clear("bench-guild");
  });

  test("add 10 tracks < 50ms", () => {
    const qe = new QueueEngine("bench-guild");
    const start = process.hrtime.bigint();
    for (let i = 0; i < 10; i++) qe.add(makeTrack(i));
    const ms = elapsedMs(start);
    assert.ok(ms < 50, `add 10 took ${ms}ms`);
  });

  test("add 1000 tracks < 50ms", () => {
    const qe = new QueueEngine("bench-guild");
    const start = process.hrtime.bigint();
    for (let i = 0; i < 1000; i++) qe.add(makeTrack(i));
    const ms = elapsedMs(start);
    assert.ok(ms < 50, `add 1000 took ${ms}ms`);
  });

  test("remove 500 from front < 50ms", () => {
    const qe = new QueueEngine("bench-guild");
    for (let i = 0; i < 1000; i++) qe.add(makeTrack(i));
    const start = process.hrtime.bigint();
    for (let i = 0; i < 500; i++) qe.next();
    const ms = elapsedMs(start);
    assert.ok(ms < 50, `remove 500 front took ${ms}ms`);
    assert.strictEqual(qe.size(), 500);
  });

  test("shuffle 1000 < 50ms", () => {
    const qe = new QueueEngine("bench-guild");
    for (let i = 0; i < 1000; i++) qe.add(makeTrack(i));
    const start = process.hrtime.bigint();
    qe.shuffle();
    const ms = elapsedMs(start);
    assert.ok(ms < 50, `shuffle 1000 took ${ms}ms`);
    assert.strictEqual(qe.size(), 1000);
  });

  test("next 1000 < 50ms", () => {
    const qe = new QueueEngine("bench-guild");
    for (let i = 0; i < 1000; i++) qe.add(makeTrack(i));
    const start = process.hrtime.bigint();
    for (let i = 0; i < 1000; i++) qe.next();
    const ms = elapsedMs(start);
    assert.ok(ms < 50, `next 1000 took ${ms}ms`);
    assert.strictEqual(qe.size(), 0);
  });

  test("1000 swaps < 50ms", () => {
    const qe = new QueueEngine("bench-guild");
    for (let i = 0; i < 1000; i++) qe.add(makeTrack(i));
    const start = process.hrtime.bigint();
    for (let i = 0; i < 1000; i++) qe.swap(0, 999);
    const ms = elapsedMs(start);
    assert.ok(ms < 50, `1000 swaps took ${ms}ms`);
  });

  test("1000 moves < 50ms", () => {
    const qe = new QueueEngine("bench-guild");
    for (let i = 0; i < 1000; i++) qe.add(makeTrack(i));
    const start = process.hrtime.bigint();
    for (let i = 0; i < 1000; i++) qe.move(0, 999);
    const ms = elapsedMs(start);
    assert.ok(ms < 50, `1000 moves took ${ms}ms`);
  });

  test("clear 1000 < 50ms", () => {
    const qe = new QueueEngine("bench-guild");
    for (let i = 0; i < 1000; i++) qe.add(makeTrack(i));
    const start = process.hrtime.bigint();
    qe.clear();
    const ms = elapsedMs(start);
    assert.ok(ms < 50, `clear 1000 took ${ms}ms`);
    assert.strictEqual(qe.size(), 0);
  });

  test("addMultiple 500 < 50ms", () => {
    const qe = new QueueEngine("bench-guild");
    const tracks = Array.from({ length: 500 }, (_, i) => makeTrack(i));
    const start = process.hrtime.bigint();
    qe.addMultiple(tracks);
    const ms = elapsedMs(start);
    assert.ok(ms < 50, `addMultiple 500 took ${ms}ms`);
    assert.strictEqual(qe.size(), 500);
  });

  test("remove 100 from middle < 50ms", () => {
    const qe = new QueueEngine("bench-guild");
    for (let i = 0; i < 1000; i++) qe.add(makeTrack(i));
    const start = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) qe.remove(450);
    const ms = elapsedMs(start);
    assert.ok(ms < 50, `remove 100 middle took ${ms}ms`);
    assert.strictEqual(qe.size(), 900);
  });

  test("remove from end 100 < 50ms", () => {
    const qe = new QueueEngine("bench-guild");
    for (let i = 0; i < 1000; i++) qe.add(makeTrack(i));
    const start = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) qe.remove(qe.size() - 1);
    const ms = elapsedMs(start);
    assert.ok(ms < 50, `remove end 100 took ${ms}ms`);
    assert.strictEqual(qe.size(), 900);
  });

  test("QueueStore 1000 guilds < 50ms", () => {
    const store = new QueueStore();
    const start = process.hrtime.bigint();
    for (let i = 0; i < 1000; i++) store.set(`guild-${i}`, [makeTrack(i)]);
    const ms = elapsedMs(start);
    assert.ok(ms < 50, `QueueStore 1000 guilds took ${ms}ms`);
    for (let i = 0; i < 1000; i++) assert.ok(store.has(`guild-${i}`));
  });

  test("CooldownManager 10000 ops < 100ms", () => {
    const start = process.hrtime.bigint();
    for (let i = 0; i < 10000; i++) {
      const uid = `user-${i % 100}`;
      CooldownManager.set(uid, "test");
      CooldownManager.check(uid, "test");
    }
    const ms = elapsedMs(start);
    assert.ok(ms < 100, `CooldownManager 10000 ops took ${ms}ms`);
  });

  test("concurrent 50 guilds add + verify", async () => {
    const start = process.hrtime.bigint();
    for (let g = 0; g < 50; g++) {
      const qe = new QueueEngine(`conc-add-${g}`);
      qe.add(makeTrack(g));
      qe.add(makeTrack(g + 100));
    }
    const ms = elapsedMs(start);
    assert.ok(ms < 50, `concurrent 50 guilds add took ${ms}ms`);
    for (let g = 0; g < 50; g++) {
      const q = state.queues.get(`conc-add-${g}`);
      assert.strictEqual(q.length, 2);
    }
  });

  test("concurrent 30 guilds shuffle 50 tracks each", () => {
    for (let g = 0; g < 30; g++) {
      const qe = new QueueEngine(`conc-shuf-${g}`);
      for (let i = 0; i < 50; i++) qe.add(makeTrack(g * 100 + i));
    }
    const start = process.hrtime.bigint();
    for (let g = 0; g < 30; g++) {
      const qe = new QueueEngine(`conc-shuf-${g}`);
      qe.shuffle();
    }
    const ms = elapsedMs(start);
    assert.ok(ms < 50, `concurrent 30 guilds shuffle took ${ms}ms`);
    for (let g = 0; g < 30; g++) {
      const q = state.queues.get(`conc-shuf-${g}`);
      assert.strictEqual(q.length, 50);
    }
  });
});
