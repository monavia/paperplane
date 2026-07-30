import { describe, test } from "vitest";
import assert from "node:assert";
import CommandInterpreter from "./CommandInterpreter.js";

const ci = new CommandInterpreter();

describe("CommandInterpreter", () => {
  test("help", () => { assert.deepStrictEqual(ci.interpret("help"), { type: "help" }); assert.deepStrictEqual(ci.interpret("bantuan"), { type: "help" }); });
  test("nowplaying", () => { assert.deepStrictEqual(ci.interpret("np"), { type: "nowplaying" }); assert.deepStrictEqual(ci.interpret("lagu sekarang"), { type: "nowplaying" }); });
  test("skip", () => { assert.deepStrictEqual(ci.interpret("skip"), { type: "skip" }); assert.deepStrictEqual(ci.interpret("lewati"), { type: "skip" }); });
  test("stop", () => { assert.deepStrictEqual(ci.interpret("stop"), { type: "stop" }); assert.deepStrictEqual(ci.interpret("berhenti"), { type: "stop" }); });
  test("pause / resume", () => { assert.deepStrictEqual(ci.interpret("pause"), { type: "pause" }); assert.deepStrictEqual(ci.interpret("resume"), { type: "resume" }); });
  test("queue", () => { assert.deepStrictEqual(ci.interpret("q"), { type: "queue" }); assert.deepStrictEqual(ci.interpret("antrian"), { type: "queue" }); });
  test("autoplay / shuffle / loop / volume", () => {
    assert.deepStrictEqual(ci.interpret("autoplay"), { type: "autoplay" });
    assert.deepStrictEqual(ci.interpret("shuffle"), { type: "shuffle" });
    assert.deepStrictEqual(ci.interpret("loop"), { type: "loop" });
    assert.deepStrictEqual(ci.interpret("volume"), { type: "volume" });
  });
  test("247 / clear / ping", () => {
    assert.deepStrictEqual(ci.interpret("247"), { type: "247" });
    assert.deepStrictEqual(ci.interpret("clear"), { type: "clear" });
    assert.deepStrictEqual(ci.interpret("ping"), { type: "ping" });
  });
  test("play with query", () => {
    assert.deepStrictEqual(ci.interpret("play iwan fals"), { type: "play", query: "iwan fals" });
    assert.deepStrictEqual(ci.interpret("mainkan lagu ini"), { type: "play", query: "ini" });
    assert.deepStrictEqual(ci.interpret("putar mata indah"), { type: "play", query: "mata indah" });
  });
  test("unknown returns chat", () => assert.deepStrictEqual(ci.interpret("halo apa kabar"), { type: "chat" }));
  test("correctionMatch", () => assert.deepStrictEqual(ci.interpret("bukan lagu itu"), { type: "correct_playlist", keyword: "lagu itu" }));
  test("Arabic commands", () => {
    assert.deepStrictEqual(ci.interpret("تخطي"), { type: "skip" });
    assert.deepStrictEqual(ci.interpret("إيقاف"), { type: "stop" });
  });
});

describe("edge cases", () => {
  test("play with spaces", () => {
    assert.deepStrictEqual(ci.interpret("play  test"), { type: "play", query: "test" });
  });
  test("play with mixed case", () => {
    assert.deepStrictEqual(ci.interpret("PLAY TEST"), { type: "play", query: "TEST" });
  });
  test("play with special chars", () => {
    assert.deepStrictEqual(ci.interpret("play @test!"), { type: "play", query: "@test!" });
  });
  test("play with numbers", () => {
    assert.deepStrictEqual(ci.interpret("play 123"), { type: "play", query: "123" });
  });
  test("play with punctuation", () => {
    assert.deepStrictEqual(ci.interpret("play test, this!"), { type: "play", query: "test, this!" });
  });
  test("cari query", () => {
    assert.deepStrictEqual(ci.interpret("cari lagu indonesia"), { type: "play", query: "indonesia" });
  });
  test("Arabic play query", () => {
    assert.deepStrictEqual(ci.interpret("شغل اغنية حب"), { type: "play", query: "حب" });
    assert.deepStrictEqual(ci.interpret("دندن حب"), { type: "play", query: "حب" });
  });
  test("prefix change variations", () => {
    assert.deepStrictEqual(ci.interpret("ubah prefix !"), { type: "prefix", prefix: "!" });
    assert.deepStrictEqual(ci.interpret("ganti prefix !!"), { type: "prefix", prefix: "!!" });
    assert.deepStrictEqual(ci.interpret("set prefix ."), { type: "prefix", prefix: "." });
    assert.deepStrictEqual(ci.interpret("change prefix ?"), { type: "prefix", prefix: "?" });
  });
  test("correction variants", () => {
    assert.deepStrictEqual(ci.interpret("bukan lagu itu"), { type: "correct_playlist", keyword: "lagu itu" });
    assert.deepStrictEqual(ci.interpret("wrong artist"), { type: "correct_playlist", keyword: "artist" });
    assert.deepStrictEqual(ci.interpret("هذا ليس صحيح"), { type: "correct_playlist", keyword: "صحيح" });
  });
  test("info", () => assert.deepStrictEqual(ci.interpret("info"), { type: "info" }));
  test("recommend variations", () => {
    assert.deepStrictEqual(ci.interpret("recommend"), { type: "recommend" });
    assert.deepStrictEqual(ci.interpret("rekomendasi"), { type: "recommend" });
    assert.deepStrictEqual(ci.interpret("rekomend"), { type: "recommend" });
  });
  test("autoplay variations", () => {
    assert.deepStrictEqual(ci.interpret("autoplay"), { type: "autoplay" });
    assert.deepStrictEqual(ci.interpret("auto play"), { type: "autoplay" });
    assert.deepStrictEqual(ci.interpret("auto-play"), { type: "autoplay" });
  });
  test("247 variations", () => {
    assert.deepStrictEqual(ci.interpret("247"), { type: "247" });
    assert.deepStrictEqual(ci.interpret("24/7"), { type: "247" });
  });
  test("clear variations", () => {
    assert.deepStrictEqual(ci.interpret("clear"), { type: "clear" });
    assert.deepStrictEqual(ci.interpret("hapus"), { type: "clear" });
    assert.deepStrictEqual(ci.interpret("bersihkan"), { type: "clear" });
  });
  test("queue variations", () => {
    assert.deepStrictEqual(ci.interpret("queue"), { type: "queue" });
    assert.deepStrictEqual(ci.interpret("lagu apa"), { type: "queue" });
    assert.deepStrictEqual(ci.interpret("طابور"), { type: "queue" });
  });
  test("stop variations", () => {
    assert.deepStrictEqual(ci.interpret("stop"), { type: "stop" });
    assert.deepStrictEqual(ci.interpret("setop"), { type: "stop" });
    assert.deepStrictEqual(ci.interpret("قف"), { type: "stop" });
  });
  test("pause variations", () => {
    assert.deepStrictEqual(ci.interpret("pause"), { type: "pause" });
    assert.deepStrictEqual(ci.interpret("tahan"), { type: "pause" });
    assert.deepStrictEqual(ci.interpret("مؤقت"), { type: "pause" });
  });
  test("resume variations", () => {
    assert.deepStrictEqual(ci.interpret("resume"), { type: "resume" });
    assert.deepStrictEqual(ci.interpret("lanjutkan"), { type: "resume" });
    assert.deepStrictEqual(ci.interpret("واصل"), { type: "resume" });
  });
  test("nowplaying variations", () => {
    assert.deepStrictEqual(ci.interpret("nowplaying"), { type: "nowplaying" });
    assert.deepStrictEqual(ci.interpret("lagu ini"), { type: "nowplaying" });
  });
  test("empty/whitespace/special/number returns chat", () => {
    assert.deepStrictEqual(ci.interpret(""), { type: "chat" });
    assert.deepStrictEqual(ci.interpret("   "), { type: "chat" });
    assert.deepStrictEqual(ci.interpret("!@#$%"), { type: "chat" });
    assert.deepStrictEqual(ci.interpret("12345"), { type: "chat" });
  });
  test("very long input", () => {
    const long = "a".repeat(10000);
    assert.doesNotThrow(() => ci.interpret(long));
    assert.deepStrictEqual(ci.interpret(long), { type: "chat" });
  });
  test("play with long query", () => {
    const longQuery = "play " + "a".repeat(5000);
    const result = ci.interpret(longQuery);
    assert.strictEqual(result.type, "play");
    assert.ok((result as { type: string; query: string }).query.length > 0);
  });
  test("multiple commands first wins", () => {
    assert.deepStrictEqual(ci.interpret("skip play test"), { type: "skip" });
    assert.deepStrictEqual(ci.interpret("pause stop"), { type: "pause" });
  });
  test("autoplay as substring no match", () => {
    assert.deepStrictEqual(ci.interpret("this is autoplay"), { type: "chat" });
    assert.deepStrictEqual(ci.interpret("autoplayer"), { type: "chat" });
  });
});
