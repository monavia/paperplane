import { describe, test } from "vitest";
import assert from "node:assert";
import { parseUrl } from "./SpotifyScraper.js";

describe("SpotifyScraper parseUrl", () => {
  test("returns null for non-spotify urls", () => {
    assert.strictEqual(parseUrl("https://google.com"), null);
  });

  test("returns null for invalid urls", () => {
    assert.strictEqual(parseUrl("not-a-url"), null);
  });

  test("parses playlist", () => {
    const r = parseUrl("https://open.spotify.com/playlist/abc123");
    assert.deepStrictEqual(r, { type: "playlist", id: "abc123" });
  });

  test("parses track", () => {
    const r = parseUrl("https://open.spotify.com/track/xyz789");
    assert.deepStrictEqual(r, { type: "track", id: "xyz789" });
  });

  test("parses album", () => {
    const r = parseUrl("https://open.spotify.com/album/def456");
    assert.deepStrictEqual(r, { type: "album", id: "def456" });
  });

  test("rejects non-spotify hostname in valid URL", () => {
    assert.strictEqual(parseUrl("https://youtube.com/playlist/abc"), null);
  });

  test("rejects URL with wrong path format", () => {
    assert.strictEqual(parseUrl("https://open.spotify.com/artist/abc"), null);
  });
});
