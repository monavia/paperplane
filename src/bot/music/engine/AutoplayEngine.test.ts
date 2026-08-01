import { describe, test, beforeEach, vi } from "vitest";
import assert from "node:assert";
import AutoplayEngine from "./AutoplayEngine.js";

function mkTrack(title: string, durationMs: number): any {
  return { info: { title, author: "Artist", duration: durationMs } };
}

describe("AutoplayEngine getNextTrack", () => {
  let engine: AutoplayEngine;
  const player = { queue: { previous: [] } };

  beforeEach(() => {
    engine = new AutoplayEngine();
  });

  test("picks first valid recommendation", async () => {
    const recs = [mkTrack("S Meme - CYKA", 9_000), mkTrack("CYKA BLYAT (Official)", 183_000)];
    (engine as any).recEngine = { getRecommendations: async () => recs };
    const t = await engine.getNextTrack(player, mkTrack("Current", 200_000), "g1");
    assert.strictEqual(t, recs[1]);
  });

  test("picks first when all recs are in range", async () => {
    const recs = [mkTrack("One", 150_000), mkTrack("Two", 250_000)];
    (engine as any).recEngine = { getRecommendations: async () => recs };
    const t = await engine.getNextTrack(player, mkTrack("Current", 200_000), "g2");
    assert.strictEqual(t, recs[0]);
  });

  test("skips tracks without duration (non-music videos)", async () => {
    const recs = [{ info: { title: "Novosibirsk State University | Top 10", author: "Uni" } }, mkTrack("Good Song", 200_000)];
    (engine as any).recEngine = { getRecommendations: async () => recs };
    const t = await engine.getNextTrack(player, mkTrack("Current", 200_000), "g6");
    assert.strictEqual(t, recs[1]);
  });

  test("returns null when all recs out of range", async () => {
    (engine as any).recEngine = { getRecommendations: async () => [mkTrack("S Meme", 9_000), mkTrack("1 hour mix", 3_600_000)] };
    const t = await engine.getNextTrack(player, mkTrack("Current", 200_000), "g3");
    assert.strictEqual(t, null);
  });

  test("returns null on empty recs", async () => {
    (engine as any).recEngine = { getRecommendations: async () => [] };
    const t = await engine.getNextTrack(player, mkTrack("Current", 200_000), "g4");
    assert.strictEqual(t, null);
  });

  test("returns null without current track info", async () => {
    (engine as any).recEngine = { getRecommendations: async () => [mkTrack("One", 150_000)] };
    const t = await engine.getNextTrack(player, {}, "g5");
    assert.strictEqual(t, null);
  });
});

describe("AutoplayEngine prefetch", () => {
  let engine: AutoplayEngine;
  const player = { queue: { previous: [] } };

  beforeEach(() => {
    engine = new AutoplayEngine();
  });

  test("prefetch stores, getNextTrack consumes cache, then recomputes", async () => {
    const recs = [mkTrack("Prefetched Song", 200_000)];
    (engine as any).recEngine = { getRecommendations: async () => recs };
    const source = mkTrack("Current", 200_000);
    await engine.prefetch(player, source, "pc1");
    assert.ok((engine as any).prefetchCache.get("pc1"), "cache filled after prefetch");

    const t = await engine.getNextTrack(player, source, "pc1");
    assert.strictEqual(t, recs[0]);
    assert.strictEqual((engine as any).prefetchCache.get("pc1"), undefined, "cache consumed");

    const t2 = await engine.getNextTrack(player, source, "pc1");
    assert.strictEqual(t2, recs[0], "recompute after cache consumed");
  });

  test("cache hit does not re-run rec engine (no extra search)", async () => {
    let calls = 0;
    (engine as any).recEngine = { getRecommendations: async () => { calls++; return [mkTrack("Hit", 200_000)]; } };
    const source = mkTrack("Current", 200_000);
    await engine.prefetch(player, source, "pc7");
    await engine.getNextTrack(player, source, "pc7");
    assert.strictEqual(calls, 1);
  });

  test("cache miss on different source track recomputes", async () => {
    (engine as any).recEngine = { getRecommendations: async () => [mkTrack("A", 200_000)] };
    await engine.prefetch(player, mkTrack("One", 200_000), "pc2");
    const t = await engine.getNextTrack(player, mkTrack("Two", 200_000), "pc2");
    assert.strictEqual(t?.info?.title, "A");
  });

  test("schedulePrefetch timer fills cache at duration - 15s", async () => {
    vi.useFakeTimers();
    try {
      (engine as any).recEngine = { getRecommendations: async () => [mkTrack("Timed", 200_000)] };
      const source = mkTrack("Current", 200_000);
      engine.schedulePrefetch(player, source, "pc3", 200_000);
      await vi.advanceTimersByTimeAsync(184_999);
      assert.strictEqual((engine as any).prefetchCache.get("pc3"), undefined);
      await vi.advanceTimersByTimeAsync(1);
      const cached = (engine as any).prefetchCache.get("pc3");
      assert.ok(cached, "cache filled after timer");
      assert.strictEqual(cached.track.info.title, "Timed");
    } finally {
      vi.useRealTimers();
    }
  });

  test("schedulePrefetch respects 10s floor for short tracks", async () => {
    vi.useFakeTimers();
    try {
      let fired = 0;
      (engine as any).recEngine = { getRecommendations: async () => { fired++; return []; } };
      engine.schedulePrefetch(player, mkTrack("S", 20_000), "pc4", 20_000);
      await vi.advanceTimersByTimeAsync(9_999);
      assert.strictEqual(fired, 0);
      await vi.advanceTimersByTimeAsync(1);
      assert.strictEqual(fired, 1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("clearPrefetch removes pending timer and cache", async () => {
    vi.useFakeTimers();
    try {
      (engine as any).recEngine = { getRecommendations: async () => [mkTrack("X", 200_000)] };
      engine.schedulePrefetch(player, mkTrack("C", 200_000), "pc5", 200_000);
      engine.clearPrefetch("pc5");
      await vi.advanceTimersByTimeAsync(200_000);
      assert.strictEqual((engine as any).prefetchCache.get("pc5"), undefined);
    } finally {
      vi.useRealTimers();
    }
  });

  test("prefetch no-op when autoplay disabled", async () => {
    (engine as any).recEngine = { getRecommendations: async () => [mkTrack("X", 200_000)] };
    (engine as any).disableAutoplayUntil.set("pc6", Date.now() + 60_000);
    await engine.prefetch(player, mkTrack("C", 200_000), "pc6");
    assert.strictEqual((engine as any).prefetchCache.get("pc6"), undefined);
  });
});
