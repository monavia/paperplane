import { describe, test } from "vitest";
import assert from "node:assert";
import { checkPrompt } from "./PromptFilter.js";

const blockedReason = "Sorry, I can't help with academic work, coding, or homework.";

describe("allowed music context", () => {
  test("play a song about coding passes", () => {
    assert.deepStrictEqual(checkPrompt("play a song about coding"), { blocked: false });
  });
  test("music with code word passes", () => {
    assert.deepStrictEqual(checkPrompt("putar lagu coding"), { blocked: false });
  });
  test("song recommendation", () => {
    assert.deepStrictEqual(checkPrompt("recommend me a song"), { blocked: false });
  });
  test("play a track", () => {
    assert.deepStrictEqual(checkPrompt("play a track"), { blocked: false });
  });
  test("search music", () => {
    assert.deepStrictEqual(checkPrompt("search music"), { blocked: false });
  });
  test("denger musik", () => {
    assert.deepStrictEqual(checkPrompt("denger musik"), { blocked: false });
  });
  test("nyanyi lagu", () => {
    assert.deepStrictEqual(checkPrompt("nyanyi lagu"), { blocked: false });
  });
  test("rekomendasi musik", () => {
    assert.deepStrictEqual(checkPrompt("rekomendasi musik"), { blocked: false });
  });
  test("mainkan lagu", () => {
    assert.deepStrictEqual(checkPrompt("mainkan lagu"), { blocked: false });
  });
  test("playlist request", () => {
    assert.deepStrictEqual(checkPrompt("playlist request"), { blocked: false });
  });
  test("artist search", () => {
    assert.deepStrictEqual(checkPrompt("cari artist"), { blocked: false });
  });
});

describe("blocked patterns", () => {
  const blocked = (prompt: string) => assert.deepStrictEqual(checkPrompt(prompt), { blocked: true, reason: blockedReason }, `"${prompt}" should be blocked`);

  test("buatkan aplikasi", () => blocked("buatkan saya aplikasi kalkulator"));
  test("tugas matematika", () => blocked("bantu saya mengerjakan tugas matematika"));
  test("tolong selesaikan soal fisika", () => blocked("tolong selesaikan soal fisika"));
  test("buat cv", () => blocked("buatkan saya cv"));
  test("tulis essay", () => blocked("tulis essay tentang ekonomi"));
  test("bantu debug program", () => blocked("bantu saya debug program"));
  test("kerjakan soal", () => blocked("kerjakan soal ini"));
  test("bantu tugas sekolah", () => blocked("bantu tugas sekolah"));
  test("buatin bot", () => blocked("buatin saya bot discord"));
  test("help homework", () => blocked("help me with my homework"));
  test("write code in", () => blocked("write a code in python for me"));
  test("selesaikan kalkulus", () => blocked("selesaikan persamaan kalkulus"));
  test("tulis kode", () => blocked("tulis kode javascript"));
  test("buatkan api", () => blocked("buatkan api endpoint"));
  test("bantu coding", () => blocked("bantu saya coding"));
  test("perbaiki bug", () => blocked("perbaiki bug program"));
  test("jawab pertanyaan", () => blocked("jawab soal pertanyaan ini"));
  test("make script in", () => blocked("make a script in javascript"));
  test("buat program tugas", () => blocked("buat program untuk tugas kuliah"));
  test("selesaikan integral", () => blocked("selesaikan hitung integral"));
  test("create program for", () => blocked("create a program for school"));
  test("tulis makalah", () => blocked("tulis makalah ilmiah"));
  test("bantu soal", () => blocked("bantu selesaikan soal kalkulus"));
});

describe("non-blocking prompts", () => {
  test("greeting", () => assert.deepStrictEqual(checkPrompt("halo apa kabar"), { blocked: false }));
  test("general chat", () => assert.deepStrictEqual(checkPrompt("good morning"), { blocked: false }));
  test("music question", () => assert.deepStrictEqual(checkPrompt("lagu apa yang sedang populer"), { blocked: false }));
  test("general question", () => assert.deepStrictEqual(checkPrompt("how's the weather"), { blocked: false }));
  test("joke", () => assert.deepStrictEqual(checkPrompt("tell me a joke"), { blocked: false }));
  test("quote", () => assert.deepStrictEqual(checkPrompt("give me a quote"), { blocked: false }));
  test("trivia", () => assert.deepStrictEqual(checkPrompt("what is the meaning of life"), { blocked: false }));
  test("help", () => assert.deepStrictEqual(checkPrompt("help"), { blocked: false }));
});

describe("edge cases", () => {
  test("empty string returns not blocked", () => {
    assert.deepStrictEqual(checkPrompt(""), { blocked: false });
  });
  test("whitespace only returns not blocked", () => {
    assert.deepStrictEqual(checkPrompt("   "), { blocked: false });
  });
  test("null throws", () => {
    assert.throws(() => checkPrompt(null as any), TypeError);
  });
  test("undefined throws", () => {
    assert.throws(() => checkPrompt(undefined as any), TypeError);
  });
  test("mixed case blocked pattern works", () => {
    assert.deepStrictEqual(checkPrompt("BANTU SAYA CODING"), { blocked: true, reason: blockedReason });
  });
  test("special chars only not blocked", () => {
    assert.deepStrictEqual(checkPrompt("!@#$%"), { blocked: false });
  });
  test("numbers only not blocked", () => {
    assert.deepStrictEqual(checkPrompt("12345"), { blocked: false });
  });
  test("emoji with music passes", () => {
    assert.deepStrictEqual(checkPrompt("🎵 play music"), { blocked: false });
  });
  test("single word not blocked", () => {
    assert.deepStrictEqual(checkPrompt("test"), { blocked: false });
  });
  test("code without music context blocked", () => {
    assert.deepStrictEqual(checkPrompt("write a function"), { blocked: true, reason: blockedReason });
  });
  test("music context with code passes", () => {
    assert.deepStrictEqual(checkPrompt("play a song about coding"), { blocked: false });
  });
  test("very long input does not crash", () => {
    assert.doesNotThrow(() => checkPrompt("a".repeat(10000)));
  });
  test("text similar to blocked but not blocked", () => {
    assert.deepStrictEqual(checkPrompt("bantu saya"), { blocked: false });
  });
  test("only music keywords pass", () => {
    assert.deepStrictEqual(checkPrompt("musik"), { blocked: false });
  });
  test("only code keywords not blocked", () => {
    assert.deepStrictEqual(checkPrompt("code"), { blocked: false });
  });
  test("reversed order blocked context not blocked", () => {
    assert.deepStrictEqual(checkPrompt("tugas ini bantu saya"), { blocked: false });
  });
  test("punctuation in query music passes", () => {
    assert.deepStrictEqual(checkPrompt("play, music!"), { blocked: false });
  });
});
