import { describe, test, vi, beforeEach } from "vitest";
import assert from "node:assert";

const mockBuild = vi.fn((msg: string) => ({ description: msg }));
vi.mock("../../ui/embeds/ErrorEmbed.js", () => ({ build: mockBuild }));

const mockGetEngine = vi.fn();
vi.mock("../../music/services/MusicService.js", () => ({ getEngine: mockGetEngine }));

describe("VoiceCheck", () => {
  let mod: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mod = await import("./VoiceCheck.js");
  });

  describe("checkUserVoice", () => {
    test("ok when in voice", () => {
      const src = { member: { voice: { channel: { id: "123" } } } };
      assert.deepStrictEqual(mod.checkUserVoice(src), { ok: true });
    });

    test("false when not in voice", () => {
      const src = { member: { voice: { channel: null } } };
      assert.deepStrictEqual(mod.checkUserVoice(src), { ok: false, message: "You must be in a voice channel." });
    });

    test("false when no member", () => {
      assert.deepStrictEqual(mod.checkUserVoice({ member: null }), { ok: false, message: "You must be in a voice channel." });
    });

    test("false when no voice property", () => {
      assert.deepStrictEqual(mod.checkUserVoice({ member: {} }), { ok: false, message: "You must be in a voice channel." });
    });
  });

  describe("checkBotVoice", () => {
    test("ok when engine has player", () => {
      mockGetEngine.mockReturnValue({ player: { voiceChannelId: "456" } });
      assert.deepStrictEqual(mod.checkBotVoice("g1"), { ok: true });
    });

    test("false when null engine", () => {
      mockGetEngine.mockReturnValue(null);
      assert.deepStrictEqual(mod.checkBotVoice("g1"), { ok: false, message: "Bot is not connected to a voice channel." });
    });

    test("false when player missing", () => {
      mockGetEngine.mockReturnValue({ player: null });
      assert.deepStrictEqual(mod.checkBotVoice("g1"), { ok: false, message: "Bot is not connected to a voice channel." });
    });

    test("correct guildId passed", () => {
      mockGetEngine.mockReturnValue({ player: { voiceChannelId: "789" } });
      mod.checkBotVoice("test-guild");
      assert.strictEqual(mockGetEngine.mock.calls[0][0], "test-guild");
    });
  });

  describe("checkSameVoice", () => {
    const source = { guildId: "g1", member: { voice: { channel: { id: "vc1" } } } };

    test("ok same VC", () => {
      mockGetEngine.mockReturnValue({ player: { voiceChannelId: "vc1" } });
      assert.deepStrictEqual(mod.checkSameVoice(source), { ok: true });
    });

    test("false no user VC", () => {
      assert.deepStrictEqual(mod.checkSameVoice({ ...source, member: { voice: { channel: null } } }), { ok: false, message: "You must be in a voice channel." });
    });

    test("false no engine", () => {
      mockGetEngine.mockReturnValue(null);
      assert.deepStrictEqual(mod.checkSameVoice(source), { ok: false, message: "Bot is not connected to a voice channel." });
    });

    test("false different VC", () => {
      mockGetEngine.mockReturnValue({ player: { voiceChannelId: "other" } });
      assert.deepStrictEqual(mod.checkSameVoice(source), { ok: false, message: "You must be in the same voice channel as the bot." });
    });

    test("false missing voiceChannelId", () => {
      mockGetEngine.mockReturnValue({ player: { voiceChannelId: null } });
      assert.deepStrictEqual(mod.checkSameVoice(source), { ok: false, message: "Bot is not connected to a voice channel." });
    });
  });

  describe("requireSameVoice", () => {
    test("true when same VC (no reply)", async () => {
      mockGetEngine.mockReturnValue({ player: { voiceChannelId: "vc1" } });
      const src = { guildId: "g1", member: { voice: { channel: { id: "vc1" } } }, channel: { send: vi.fn() } };
      assert.strictEqual(await mod.requireSameVoice(src), true);
    });

    test("false with error embed reply", async () => {
      mockGetEngine.mockReturnValue(null);
      const src = { guildId: "g1", member: { voice: { channel: { id: "vc1" } } }, reply: vi.fn() };
      const result = await mod.requireSameVoice(src);
      assert.strictEqual(result, false);
      assert.strictEqual(src.reply.mock.calls.length, 1);
      assert.strictEqual(mockBuild.mock.calls.length, 1);
    });

    test("prefix path via channel.send", async () => {
      mockGetEngine.mockReturnValue(null);
      const src = { guildId: "g1", member: { voice: { channel: { id: "vc1" } } }, channel: { send: vi.fn() } };
      const result = await mod.requireSameVoice(src);
      assert.strictEqual(result, false);
      assert.strictEqual(src.channel.send.mock.calls.length, 1);
    });
  });

  describe("withVoiceCheck", () => {
    test("calls handler on pass", async () => {
      mockGetEngine.mockReturnValue({ player: { voiceChannelId: "vc1" } });
      const src = { guildId: "g1", member: { voice: { channel: { id: "vc1" } } }, channel: { send: vi.fn() } };
      const handler = vi.fn(async () => "result");
      assert.strictEqual(await mod.withVoiceCheck(handler)(src), "result");
    });

    test("skips handler on fail", async () => {
      mockGetEngine.mockReturnValue(null);
      const src = { guildId: "g1", member: { voice: { channel: { id: "vc1" } } }, channel: { send: vi.fn() } };
      const handler = vi.fn();
      await mod.withVoiceCheck(handler)(src);
      assert.strictEqual(handler.mock.calls.length, 0);
    });
  });
});
