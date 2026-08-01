import { describe, test, beforeEach } from "vitest";
import assert from "node:assert";
import LoopStore from "./LoopStore.js";
import ShuffleStore from "./ShuffleStore.js";
import PositionStore from "./PositionStore.js";
import FilterStore from "./FilterStore.js";
import EqualizerStore from "./EqualizerStore.js";
import AutoplayStore from "./AutoplayStore.js";
import TwentyFourSevenStore from "./TwentyFourSevenStore.js";
import VoiceChannelStore from "./VoiceChannelStore.js";
import NowPlayingStore from "./NowPlayingStore.js";
import QueueStore from "./QueueStore.js";

describe("LoopStore", () => {
  let store: LoopStore;
  beforeEach(() => { store = new LoopStore(); });

  test("default is off", () => assert.strictEqual(store.get("g1"), "off"));
  test("set track mode", () => { store.set("g1", "track"); assert.strictEqual(store.get("g1"), "track"); });
  test("set playlist mode", () => { store.set("g1", "playlist"); assert.strictEqual(store.get("g1"), "playlist"); });
  test("set off mode", () => { store.set("g1", "track"); store.set("g1", "off"); assert.strictEqual(store.get("g1"), "off"); });
  test("delete resets to default", () => { store.set("g1", "track"); store.delete("g1"); assert.strictEqual(store.get("g1"), "off"); });
  test("guilds isolated", () => { store.set("g1", "track"); store.set("g2", "playlist"); assert.strictEqual(store.get("g1"), "track"); assert.strictEqual(store.get("g2"), "playlist"); });
});

describe("ShuffleStore", () => {
  let store: ShuffleStore;
  beforeEach(() => { store = new ShuffleStore(); });

  test("default is false", () => assert.ok(!store.get("g1")));
  test("set true", () => { store.set("g1", true); assert.ok(store.get("g1")); });
  test("set false", () => { store.set("g1", true); store.set("g1", false); assert.ok(!store.get("g1")); });
  test("toggle flips value", () => { assert.ok(store.toggle("g1")); assert.ok(!store.toggle("g1")); });
  test("delete resets to false", () => { store.set("g1", true); store.delete("g1"); assert.ok(!store.get("g1")); });
  test("guilds isolated", () => { store.set("g1", true); assert.ok(!store.get("g2")); });
});

describe("PositionStore", () => {
  let store: PositionStore;
  beforeEach(() => { store = new PositionStore(); });

  test("default is 0", () => assert.strictEqual(store.get("g1"), 0));
  test("set position", () => { store.set("g1", 50000); assert.strictEqual(store.get("g1"), 50000); });
  test("set 0", () => { store.set("g1", 0); assert.strictEqual(store.get("g1"), 0); });
  test("overwrite position", () => { store.set("g1", 100); store.set("g1", 200); assert.strictEqual(store.get("g1"), 200); });
  test("has returns true after set", () => { store.set("g1", 300); assert.ok(store.has("g1")); });
  test("has returns false for unknown", () => assert.ok(!store.has("unknown")));
  test("delete removes position", () => { store.set("g1", 400); store.delete("g1"); assert.strictEqual(store.get("g1"), 0); });
  test("entries iterates all guilds", () => {
    store.set("g1", 100); store.set("g2", 200);
    const result = Object.fromEntries(store.entries());
    assert.deepStrictEqual(result, { g1: 100, g2: 200 });
  });
  test("guilds isolated", () => { store.set("g1", 999); assert.strictEqual(store.get("g2"), 0); });
});

describe("FilterStore", () => {
  let store: FilterStore;
  beforeEach(() => { store = new FilterStore(); });

  test("default is empty", () => assert.deepStrictEqual(store.get("g1"), []));
  test("set filters", () => { store.set("g1", ["bassboost", "soft"]); assert.deepStrictEqual(store.get("g1"), ["bassboost", "soft"]); });
  test("toggle adds filter", () => { store.toggle("g1", "nightcore"); assert.deepStrictEqual(store.get("g1"), ["nightcore"]); });
  test("toggle removes filter", () => { store.set("g1", ["nightcore"]); store.toggle("g1", "nightcore"); assert.deepStrictEqual(store.get("g1"), []); });
  test("isActive false when empty", () => { assert.ok(!store.isActive("g1")); });
  test("isActive true after set", () => { store.set("g1", ["bassboost"]); assert.ok(store.isActive("g1")); });
  test("clear empties filters", () => { store.set("g1", ["bassboost"]); store.clear("g1"); assert.deepStrictEqual(store.get("g1"), []); });
  test("delete removes entry", () => { store.set("g1", ["bassboost"]); store.delete("g1"); assert.deepStrictEqual(store.get("g1"), []); });
  test("set filters deduplicates", () => { store.set("g1", ["a", "a", "b"]); assert.deepStrictEqual(store.get("g1"), ["a", "b"]); });
  test("set filters removes none", () => { store.set("g1", ["none", "b"]); assert.deepStrictEqual(store.get("g1"), ["b"]); });
  test("guilds isolated", () => { store.set("g1", ["bassboost"]); assert.deepStrictEqual(store.get("g2"), []); });
});

describe("EqualizerStore", () => {
  let store: EqualizerStore;
  beforeEach(() => { store = new EqualizerStore(); });

  test("default is null", () => assert.strictEqual(store.get("g1"), null));
  test("set equalizer bands", () => { const bands = [{ band: 0, gain: 0.5 }]; store.set("g1", bands); assert.deepStrictEqual(store.get("g1"), bands); });
  test("overwrite equalizer", () => { store.set("g1", [{ band: 0, gain: 0.5 }]); store.set("g1", [{ band: 1, gain: -0.2 }]); assert.strictEqual(store.get("g1")[0].band, 1); });
  test("delete resets to null", () => { store.set("g1", []); store.delete("g1"); assert.strictEqual(store.get("g1"), null); });
  test("guilds isolated", () => { store.set("g1", [{ band: 0, gain: 1 }]); assert.strictEqual(store.get("g2"), null); });
});

describe("AutoplayStore", () => {
  let store: AutoplayStore;
  beforeEach(() => { store = new AutoplayStore(); });

  test("default is false", () => assert.ok(!store.get("g1")));
  test("set true", () => { store.set("g1", true); assert.ok(store.get("g1")); });
  test("set false", () => { store.set("g1", true); store.set("g1", false); assert.ok(!store.get("g1")); });
  test("delete resets to false", () => { store.set("g1", true); store.delete("g1"); assert.ok(!store.get("g1")); });
  test("guilds isolated", () => { store.set("g1", true); assert.ok(!store.get("g2")); });
});

describe("TwentyFourSevenStore", () => {
  let store: TwentyFourSevenStore;
  beforeEach(() => { store = new TwentyFourSevenStore(); });

  test("default is disabled", () => assert.ok(!store.isEnabled("g1")));
  test("default channelId is undefined", () => assert.strictEqual(store.getChannelId("g1"), undefined));
  test("set enabled without channel", () => { store.set("g1", true); assert.ok(store.isEnabled("g1")); assert.strictEqual(store.getChannelId("g1"), undefined); });
  test("set enabled with channel", () => { store.set("g1", true, "vc1"); assert.ok(store.isEnabled("g1")); assert.strictEqual(store.getChannelId("g1"), "vc1"); });
  test("set disabled clears channel", () => { store.set("g1", true, "vc1"); store.set("g1", false); assert.ok(!store.isEnabled("g1")); assert.strictEqual(store.getChannelId("g1"), undefined); });
  test("delete resets to disabled", () => { store.set("g1", true); store.delete("g1"); assert.ok(!store.isEnabled("g1")); });
  test("guilds isolated", () => { store.set("g1", true); assert.ok(!store.isEnabled("g2")); });
});

describe("VoiceChannelStore", () => {
  let store: VoiceChannelStore;
  beforeEach(() => { store = new VoiceChannelStore(); });

  test("get returns undefined for unknown", () => assert.strictEqual(store.get("g1"), undefined));
  test("set and get round-trip", () => { store.set("g1", "vc1", "tc1"); const r = store.get("g1"); assert.strictEqual(r?.voiceChannelId, "vc1"); assert.strictEqual(r?.textChannelId, "tc1"); });
  test("overwrite values", () => { store.set("g1", "vc1", "tc1"); store.set("g1", "vc2", "tc2"); const r = store.get("g1"); assert.strictEqual(r?.voiceChannelId, "vc2"); assert.strictEqual(r?.textChannelId, "tc2"); });
  test("delete removes entry", () => { store.set("g1", "vc1", "tc1"); store.delete("g1"); assert.strictEqual(store.get("g1"), undefined); });
  test("entries iterates all guilds", () => {
    store.set("g1", "vc1", "tc1"); store.set("g2", "vc2", "tc2");
    const result: any = {};
    for (const [k, v] of store.entries()) result[k] = v;
    assert.strictEqual(result.g1.voiceChannelId, "vc1"); assert.strictEqual(result.g2.voiceChannelId, "vc2");
  });
  test("guilds isolated", () => { store.set("g1", "vc1", "tc1"); assert.strictEqual(store.get("g2"), undefined); });
});

describe("NowPlayingStore", () => {
  let store: NowPlayingStore;
  beforeEach(() => { store = new NowPlayingStore(); });

  test("get returns undefined for unknown", () => assert.strictEqual(store.get("g1"), undefined));
  test("set and get round-trip", () => { const t = { title: "test", author: "artist" }; store.set("g1", t); assert.deepStrictEqual(store.get("g1"), t); });
  test("has returns true after set", () => { store.set("g1", {}); assert.ok(store.has("g1")); });
  test("has returns false for unknown", () => assert.ok(!store.has("unknown")));
  test("delete removes entry", () => { store.set("g1", {}); store.delete("g1"); assert.ok(!store.has("g1")); });
  test("size reflects count", () => { store.set("g1", {}); store.set("g2", {}); assert.strictEqual(store.size, 2); });
  test("size after delete", () => { store.set("g1", {}); store.delete("g1"); assert.strictEqual(store.size, 0); });
  test("entries iterates all guilds", () => {
    store.set("g1", { title: "t1" }); store.set("g2", { title: "t2" });
    const result: any = {}; for (const [k, v] of store.entries()) result[k] = v;
    assert.strictEqual(result.g1.title, "t1"); assert.strictEqual(result.g2.title, "t2");
  });
  test("overwrite existing track", () => { store.set("g1", { title: "old" }); store.set("g1", { title: "new" }); assert.strictEqual(store.get("g1").title, "new"); });
});

describe("QueueStore syncToPlayer (mirror)", () => {
  function mkStoreWithMirror() {
    const store = new QueueStore();
    const mirror: any = {
      tracks: [],
      splice(index: number, amount: number, insert?: any) {
        if (amount) mirror.tracks.splice(index, amount);
        if (insert !== undefined) {
          const items = Array.isArray(insert) ? insert.flat(2) : [insert];
          mirror.tracks.splice(index, 0, ...items);
        }
        return mirror.tracks[index] ?? null;
      },
    };
    store.setPlayerGetter(() => ({ queue: mirror }));
    return { store, mirror };
  }

  test("mirror tracks follow RAM state on set", () => {
    const { store, mirror } = mkStoreWithMirror();
    store.set("g1", [{ info: { title: "A" } }, { info: { title: "B" } }]);
    assert.strictEqual(mirror.tracks.length, 2);
    store.set("g1", []);
    assert.strictEqual(mirror.tracks.length, 0);
  });

  test("syncToPlayer rewrites mirror from RAM", () => {
    const { store, mirror } = mkStoreWithMirror();
    store.set("g1", [{ info: { title: "A" } }]);
    mirror.tracks.push({ info: { title: "GHOST" } });
    store.syncToPlayer("g1");
    assert.strictEqual(mirror.tracks.length, 1);
  });

  test("syncToPlayer no-ops when RAM has no data for guild", () => {
    const { store, mirror } = mkStoreWithMirror();
    mirror.tracks.push({ info: { title: "GHOST" } });
    store.syncToPlayer("unknown-guild");
    assert.strictEqual(mirror.tracks.length, 1);
  });
});
