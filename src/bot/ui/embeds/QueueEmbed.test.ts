import { describe, test } from "vitest";
import assert from "node:assert";
import { build, buildQueuePayload } from "./QueueEmbed.js";

function makeTrack(title: string, author = "Artist", duration = 200000) {
  return { info: { title, author, duration, uri: `https://example.com/${title}` } };
}

describe("QueueEmbed", () => {
  describe("build", () => {
    test("returns empty queue message", () => {
      const { embed } = build([], 1);
      assert.strictEqual(embed.data.description, "The queue is empty.");
    });

    test("single page under 10 tracks", () => {
      const tracks = [makeTrack("A"), makeTrack("B")];
      const { embed, totalPages } = build(tracks, 1);
      assert.strictEqual(totalPages, 1);
      assert.ok(embed.data.description!.includes("A"));
      assert.ok(embed.data.description!.includes("B"));
    });

    test("multi-page: 25 tracks = 3 pages", () => {
      const tracks = Array.from({ length: 25 }, (_, i) => makeTrack(`T${i + 1}`));
      const { embed, totalPages } = build(tracks, 1);
      assert.strictEqual(totalPages, 3);
      assert.ok(embed.data.footer!.text.includes("Page 1/3"));
    });

    test("page 2 shows correct items", () => {
      const tracks = Array.from({ length: 25 }, (_, i) => makeTrack(`T${i + 1}`));
      const { embed } = build(tracks, 2);
      assert.ok(embed.data.description!.includes("T11"));
      assert.ok(embed.data.description!.includes("T20"));
      assert.ok(!embed.data.description!.includes("[T1]"));
    });

    test("page beyond max clamps to last page", () => {
      const tracks = Array.from({ length: 10 }, (_, i) => makeTrack(`T${i + 1}`));
      const { embed, totalPages } = build(tracks, 99);
      assert.strictEqual(totalPages, 1);
      assert.strictEqual(embed.data.footer!.text, "Page 1/1 • 10 tracks");
    });

    test("shows now playing in author", () => {
      const tracks = [makeTrack("NowSong", "NowAuthor")];
      const { embed } = build(tracks, 1);
      assert.ok(embed.data.author!.name.includes("Now Playing"));
      assert.ok(embed.data.author!.name.includes("NowSong"));
      assert.ok(embed.data.author!.name.includes("NowAuthor"));
    });

    test("no author when empty queue", () => {
      const { embed } = build([], 1);
      assert.strictEqual(embed.data.author, undefined);
    });
  });

  describe("buildQueuePayload", () => {
    test("returns embeds and components", () => {
      const payload = buildQueuePayload([makeTrack("A")], 1);
      assert.ok(Array.isArray(payload.embeds));
      assert.ok(Array.isArray(payload.components));
    });

    test("first page disables prev buttons", () => {
      const payload = buildQueuePayload([makeTrack("A")], 1);
      const row = payload.components![0];
      assert.strictEqual(row.components[0].data.disabled, true);
      assert.strictEqual(row.components[1].data.disabled, true);
      assert.strictEqual(row.components[2].data.disabled, true);
      assert.strictEqual(row.components[3].data.disabled, true);
    });

    test("multi-page enables next buttons on page 1", () => {
      const tracks = Array.from({ length: 15 }, (_, i) => makeTrack(`T${i + 1}`));
      const payload = buildQueuePayload(tracks, 1);
      const row = payload.components![0];
      assert.strictEqual(row.components[0].data.disabled, true);
      assert.strictEqual(row.components[1].data.disabled, true);
      assert.strictEqual(row.components[2].data.disabled, false);
      assert.strictEqual(row.components[3].data.disabled, false);
    });

    test("last page disables next buttons", () => {
      const tracks = Array.from({ length: 15 }, (_, i) => makeTrack(`T${i + 1}`));
      const payload = buildQueuePayload(tracks, 2);
      const row = payload.components![0];
      assert.strictEqual(row.components[0].data.disabled, false);
      assert.strictEqual(row.components[1].data.disabled, false);
      assert.strictEqual(row.components[2].data.disabled, true);
      assert.strictEqual(row.components[3].data.disabled, true);
    });

    test("middle page enables all buttons", () => {
      const tracks = Array.from({ length: 25 }, (_, i) => makeTrack(`T${i + 1}`));
      const payload = buildQueuePayload(tracks, 2);
      const row = payload.components![0];
      assert.strictEqual(row.components[0].data.disabled, false);
      assert.strictEqual(row.components[1].data.disabled, false);
      assert.strictEqual(row.components[2].data.disabled, false);
      assert.strictEqual(row.components[3].data.disabled, false);
    });
  });
});
