import { describe, test } from "vitest";
import assert from "node:assert";
import CommandInterpreter from "./CommandInterpreter";

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
