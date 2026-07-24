import { describe, test, beforeEach } from "vitest";
import assert from "node:assert";
import QueueEngine from "./QueueEngine.js";
import state from "../../core/state/StateManager.js";

let qe: QueueEngine;

describe("QueueEngine", () => {
  beforeEach(() => {
    state.queues.clear("test-guild");
    state.nowPlaying.delete("test-guild");
    qe = new QueueEngine("test-guild");
  });

  test("starts empty", () => { assert.strictEqual(qe.size(), 0); assert.strictEqual(qe.next(), null); });
  test("add one track", () => { qe.add({ info: { title: "A" } }); assert.strictEqual(qe.size(), 1); });
  test("add multiple", () => { qe.addMultiple([{ info: { title: "A" } }, { info: { title: "B" } }]); assert.strictEqual(qe.size(), 2); });
  test("next returns and removes first", () => {
    const a = { info: { title: "A" } }; const b = { info: { title: "B" } };
    qe.add(a); qe.add(b);
    assert.strictEqual(qe.next(), a); assert.strictEqual(qe.size(), 1);
  });
  test("remove by index", () => {
    const a = { info: { title: "A" } }; const b = { info: { title: "B" } }; const c = { info: { title: "C" } };
    qe.addMultiple([a, b, c]); assert.strictEqual(qe.remove(1), b); assert.deepStrictEqual(qe.getAll(), [a, c]);
  });
  test("clear removes all", () => { qe.addMultiple([{ info: { title: "A" } }, { info: { title: "B" } }]); qe.clear(); assert.strictEqual(qe.size(), 0); });
  test("swap", () => {
    const a = { info: { title: "A" } }; const b = { info: { title: "B" } };
    qe.addMultiple([a, b]); assert.ok(qe.swap(0, 1)); assert.deepStrictEqual(qe.getAll(), [b, a]);
  });
  test("move", () => {
    const a = { info: { title: "A" } }; const b = { info: { title: "B" } }; const c = { info: { title: "C" } };
    qe.addMultiple([a, b, c]); qe.move(0, 2); assert.deepStrictEqual(qe.getAll(), [b, c, a]);
  });
  test("shuffle keeps all tracks", () => {
    const tracks = [1, 2, 3, 4, 5].map(i => ({ info: { title: `T${i}` } }));
    qe.addMultiple(tracks); qe.shuffle(); assert.strictEqual(qe.size(), 5);
  });
  test("removeRange", () => {
    const a = { info: { title: "A" } }; const b = { info: { title: "B" } }; const c = { info: { title: "C" } }; const d = { info: { title: "D" } };
    qe.addMultiple([a, b, c, d]); assert.strictEqual(qe.removeRange(1, 2), 2); assert.deepStrictEqual(qe.getAll(), [a, d]);
  });
});
