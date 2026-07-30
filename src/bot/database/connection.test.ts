import { describe, test, vi, beforeEach } from "vitest";
import assert from "node:assert";

vi.mock("mongoose", () => {
  const connect = vi.fn();
  const disconnect = vi.fn();
  return { default: { connect, disconnect }, connect, disconnect };
});

vi.mock("../core/utils/Logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), ready: vi.fn(), safe: vi.fn(() => vi.fn()) },
}));

vi.mock("./prisma.js", () => ({
  $connect: vi.fn().mockResolvedValue(undefined),
  $disconnect: vi.fn().mockResolvedValue(undefined),
}));

import mongoose from "mongoose";
const mongooseMock = mongoose as any;

describe("connection", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("isUsingPrisma false when DATABASE_URL not set", async () => {
    const mod = await import("./connection.js");
    assert.strictEqual(mod.isUsingPrisma(), false);
    await mod.connect();
    assert.strictEqual(mod.isUsingPrisma(), false);
    assert.strictEqual(mongooseMock.connect.mock.calls.length, 1);
  });

  test("isUsingPrisma true with postgresql:// URL", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost/mydb");
    const mod = await import("./connection.js");
    assert.strictEqual(mod.isUsingPrisma(), false);
    await mod.connect();
    assert.strictEqual(mod.isUsingPrisma(), true);
    assert.strictEqual(mongooseMock.connect.mock.calls.length, 0);
  });

  test("isUsingPrisma true with postgres:// URL", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@localhost/mydb");
    const mod = await import("./connection.js");
    await mod.connect();
    assert.strictEqual(mod.isUsingPrisma(), true);
    assert.strictEqual(mongooseMock.connect.mock.calls.length, 0);
  });

  test("disconnect calls mongooseMock.disconnect when not using Prisma", async () => {
    const mod = await import("./connection.js");
    await mod.connect();
    await mod.disconnect();
    assert.strictEqual(mongooseMock.disconnect.mock.calls.length, 1);
  });

  test("disconnect skips mongooseMock.disconnect when using Prisma", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost/mydb");
    const mod = await import("./connection.js");
    await mod.connect();
    await mod.disconnect();
    assert.strictEqual(mongooseMock.disconnect.mock.calls.length, 0);
  });
});
