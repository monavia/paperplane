import { describe, test, beforeEach, vi } from "vitest";
import assert from "node:assert";

vi.mock("./AIEngine.js", () => ({
  default: { ask: vi.fn() },
}));

import AIDJ from "./AIDJ.js";
import AIEngine from "./AIEngine.js";

const askMock = (AIEngine as any).ask as ReturnType<typeof vi.fn>;

const aidj = new AIDJ();

describe("AIDJ", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test("simple commands delegated to CI without AI", async () => {
    const result = await aidj.interpret("user-1", "skip");
    assert.deepStrictEqual(result, { type: "skip" });
    assert.strictEqual(askMock.mock.calls.length, 0);
  });

  test("PLAY from AI", async () => {
    askMock.mockResolvedValue("PLAY: bohemian rhapsody");
    const result = await aidj.interpret("user-1", "nyanyi");
    assert.deepStrictEqual(result, { type: "play", query: "bohemian rhapsody" });
  });

  test("PLAYLIST comma-separated", async () => {
    askMock.mockResolvedValue("PLAYLIST: song1 by a1, song2 by a2");
    const result = await aidj.interpret("user-1", "nyanyi");
    assert.deepStrictEqual(result, { type: "playlist", songs: ["song1 by a1", "song2 by a2"] });
  });

  test("PLAYLIST single song", async () => {
    askMock.mockResolvedValue("PLAYLIST: song by artist");
    const result = await aidj.interpret("user-1", "nyanyi");
    assert.deepStrictEqual(result, { type: "playlist", songs: ["song by artist"] });
  });

  test("CORRECT from AI", async () => {
    askMock.mockResolvedValue("CORRECT: keyword");
    const result = await aidj.interpret("user-1", "nyanyi");
    assert.deepStrictEqual(result, { type: "correct_playlist", keyword: "keyword" });
  });

  test("all command types from AI", async () => {
    const commands: [string, any][] = [
      ["SKIP", { type: "skip" }], ["STOP", { type: "stop" }],
      ["PAUSE", { type: "pause" }], ["RESUME", { type: "resume" }],
      ["QUEUE", { type: "queue" }], ["AUTOPLAY", { type: "autoplay" }],
      ["SHUFFLE", { type: "shuffle" }], ["LOOP", { type: "loop" }],
      ["247", { type: "247" }], ["CLEAR", { type: "clear" }],
      ["RECOMMEND", { type: "recommend" }], ["NOWPLAYING", { type: "nowplaying" }],
      ["VOLUME", { type: "volume" }], ["INFO", { type: "info" }],
      ["PING", { type: "ping" }], ["HELP", { type: "help" }],
    ];
    for (const [aiLine, expected] of commands) {
      askMock.mockResolvedValue(aiLine);
      const result = await aidj.interpret("user-1", "nyanyi");
      assert.deepStrictEqual(result, expected, `${aiLine} should produce ${JSON.stringify(expected)}`);
    }
  });

  test("chat fallback returns AI reply", async () => {
    askMock.mockResolvedValue("saya adalah asisten musik");
    const result = await aidj.interpret("user-1", "halo");
    assert.deepStrictEqual(result, { type: "chat", reply: "saya adalah asisten musik" });
  });

  test("multiline AI response uses first line", async () => {
    askMock.mockResolvedValue("PLAY: test\nsome other text");
    const result = await aidj.interpret("user-1", "halo");
    assert.deepStrictEqual(result, { type: "play", query: "test" });
  });

  test("whitespace trimming in AI response", async () => {
    askMock.mockResolvedValue("  PLAY:  test song  ");
    const result = await aidj.interpret("user-1", "halo");
    assert.deepStrictEqual(result, { type: "play", query: "test song" });
  });

  test("ask called with correct params — real userId, no memory clear", async () => {
    askMock.mockResolvedValue("halo juga");
    await aidj.interpret("user-1", "halo");
    assert.strictEqual(askMock.mock.calls[0][0], "user-1");
    assert.strictEqual(askMock.mock.calls[0][1], "halo");
  });
});
