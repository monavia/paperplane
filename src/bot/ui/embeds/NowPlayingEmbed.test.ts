import { describe, test, vi, beforeEach } from "vitest";
import assert from "node:assert";

vi.mock("../../music/services/TitleResolver.js", () => ({
  cleanTitle: vi.fn((title: string, author: string) => ({ title, author })),
}));

describe("NowPlayingEmbed", () => {
  let mod: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mod = await import("./NowPlayingEmbed.js");
  });

  const spotifyTrack = { info: { title: "Song", author: "Artist", source: "spotify", spotifyUrl: "https://open.spotify.com/track/abc" } };
  const deezerTrack = { info: { title: "Song", author: "Artist", source: "deezer" } };
  const hybridTrack = { info: { title: "Song", author: "Artist", source: "deezer", spotifyUrl: "https://open.spotify.com/track/xyz" } };

  describe("getSourceEmoji", () => {
    test("returns spotify for spotify source", () => {
      const result = mod.getSourceEmoji("spotify");
      assert.ok(result.includes("spotify"));
    });

    test("returns deezer for non-spotify", () => {
      const result = mod.getSourceEmoji("deezer");
      assert.ok(result.includes("deezer"));
    });

    test("returns spotify when spotifyUrl present", () => {
      const result = mod.getSourceEmoji("deezer", "https://open.spotify.com/track/abc");
      assert.ok(result.includes("spotify"));
    });
  });

  describe("build", () => {
    test("returns embed with track info", () => {
      const embed = mod.build(spotifyTrack, {});
      assert.ok(embed.data.description!.includes("Song"));
      assert.ok(embed.data.description!.includes("Artist"));
      assert.ok(embed.data.description!.includes("open.spotify.com"));
    });

    test("handles missing info", () => {
      const embed = mod.build({ info: {} }, {});
      assert.ok(embed.data.description!.includes("Unknown"));
    });

    test("handles spotify URI conversion", () => {
      const uriTrack = { info: { title: "S", author: "A", source: "spotify", spotifyUrl: "spotify:track:12345" } };
      const embed = mod.build(uriTrack, {});
      assert.ok(embed.data.description!.includes("open.spotify.com/track/12345"));
    });
  });

  describe("addedToQueue", () => {
    test("returns embed with position", () => {
      const embed = mod.addedToQueue(spotifyTrack, 3);
      assert.ok(embed.data.description!.includes("Added to Queue"));
      assert.ok(embed.data.description!.includes("Position in Queue"));
      assert.ok(embed.data.description!.includes("3"));
    });

    test("handles missing position", () => {
      const embed = mod.addedToQueue(deezerTrack, undefined);
      assert.ok(embed.data.description!.includes("1"));
    });
  });
});
