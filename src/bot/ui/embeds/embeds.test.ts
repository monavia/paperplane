import { describe, test } from "vitest";
import assert from "node:assert";
import { build as successBuild } from "./SuccessEmbed.js";
import { build as loadingBuild } from "./LoadingEmbed.js";
import { build as pingBuild } from "./PingEmbed.js";
import { build as aiBuild } from "./AIEmbed.js";

describe("SuccessEmbed", () => {
  test("build returns embed with message", () => {
    const embed = successBuild("Operation completed");
    assert.strictEqual(embed.data.description, "Operation completed");
  });
});

describe("LoadingEmbed", () => {
  test("build returns info embed", () => {
    const embed = loadingBuild("Loading...");
    assert.strictEqual(embed.data.description, "Loading...");
  });
});

describe("PingEmbed", () => {
  test("build has Pong title", () => {
    const embed = pingBuild(10, 20, 30);
    assert.strictEqual(embed.data.title, "Pong!");
  });

  test("build has 3 latency fields", () => {
    const embed = pingBuild(10, 20, 30);
    assert.strictEqual(embed.data.fields!.length, 3);
    assert.strictEqual(embed.data.fields![0].name, "Bot Latency");
    assert.strictEqual(embed.data.fields![1].name, "Gateway Latency");
    assert.strictEqual(embed.data.fields![2].name, "API Latency");
  });

  test("accepts string API latency", () => {
    const embed = pingBuild(10, 20, "N/A");
    assert.strictEqual(embed.data.fields![2].value, "`N/A`");
  });

  test("sums latencies in footer", () => {
    const embed = pingBuild(15, 25, 30);
    assert.match(embed.data.footer!.text, /40ms total/);
  });
});

describe("AIEmbed", () => {
  test("build has answer in description", () => {
    const embed = aiBuild("This is a response");
    assert.strictEqual(embed.data.description, "This is a response");
  });

  test("build has Paperplane author", () => {
    const embed = aiBuild("response");
    assert.strictEqual(embed.data.author!.name, "Paperplane");
  });

  test("truncates answer at 2000 chars", () => {
    const long = "x".repeat(2500);
    const embed = aiBuild(long);
    assert.strictEqual(embed.data.description!.length, 2000);
    assert.ok(embed.data.description!.endsWith("..."));
  });
});
