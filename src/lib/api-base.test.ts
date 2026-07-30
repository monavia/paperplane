import { describe, test, vi, beforeEach } from "vitest";
import assert from "node:assert";

vi.mock("../bot/core/utils/Logger.js", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), ready: vi.fn(), safe: vi.fn(() => vi.fn()) },
}));

vi.mock("../bot/telemetry/MetricsCollector.js", () => ({
  incRateLimitBlocked: vi.fn(),
  incRateLimitAllowed: vi.fn(),
}));

vi.mock("../bot/cache/redis.js", () => ({
  isAvailable: vi.fn(() => false),
  getCache: vi.fn(() => null),
}));

vi.mock("../bot/config/bot.js", () => ({
  default: { redisPrefix: "paperplane:" },
}));

import { ApiError, jsonResponse, createApiHandler, withAuth, globalRateLimit, getUserId } from "./api-base.js";

function mockRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}

describe("ApiError", () => {
  test("constructs with status and message", () => {
    const err = new ApiError(404, "Not found");
    assert.strictEqual(err.statusCode, 404);
    assert.strictEqual(err.message, "Not found");
    assert.strictEqual(err.name, "ApiError");
    assert.ok(err instanceof Error);
  });
});

describe("jsonResponse", () => {
  test("returns success response", () => {
    const res = mockRes();
    jsonResponse(res, { value: 42 });
    assert.strictEqual(res.status.mock.calls.length, 1);
    assert.strictEqual(res.status.mock.calls[0][0], 200);
    assert.strictEqual(res.json.mock.calls[0][0].success, true);
    assert.strictEqual(res.json.mock.calls[0][0].data.value, 42);
  });

  test("accepts custom status", () => {
    const res = mockRes();
    jsonResponse(res, null, 201);
    assert.strictEqual(res.status.mock.calls[0][0], 201);
  });
});

describe("createApiHandler", () => {
  test("success", async () => {
    const handler = createApiHandler(async (_req, res) => {
      jsonResponse(res, { ok: true });
    });
    const res = mockRes();
    await handler({}, res, vi.fn());
    assert.strictEqual(res.status.mock.calls[0][0], 200);
    assert.strictEqual(res.json.mock.calls[0][0].success, true);
    assert.strictEqual(res.json.mock.calls[0][0].data.ok, true);
  });

  test("ApiError", async () => {
    const handler = createApiHandler(async () => { throw new ApiError(403, "Forbidden"); });
    const res = mockRes();
    await handler({}, res, vi.fn());
    assert.strictEqual(res.status.mock.calls[0][0], 403);
    assert.strictEqual(res.json.mock.calls[0][0].success, false);
    assert.strictEqual(res.json.mock.calls[0][0].error, "Forbidden");
  });

  test("500 on unexpected error", async () => {
    const handler = createApiHandler(async () => { throw new Error("boom"); });
    const res = mockRes();
    await handler({}, res, vi.fn());
    assert.strictEqual(res.status.mock.calls[0][0], 500);
    assert.strictEqual(res.json.mock.calls[0][0].success, false);
    assert.strictEqual(res.json.mock.calls[0][0].error, "Internal server error");
  });
});

describe("withAuth", () => {
  test("exempt path passes through", () => {
    const req = { path: "/api/health", headers: {}, ip: "10.0.0.1", connection: {} };
    const next = vi.fn();
    withAuth()(req, null as any, next);
    assert.strictEqual(next.mock.calls.length, 1);
  });

  test("localhost passes through", () => {
    const req = { path: "/api/test", headers: {}, ip: "127.0.0.1", connection: { remoteAddress: "127.0.0.1" } };
    const next = vi.fn();
    withAuth()(req, null as any, next);
    assert.strictEqual(next.mock.calls.length, 1);
  });

  test("remote IP returns 401", () => {
    const req = { path: "/api/test", headers: {}, ip: "10.0.0.1", connection: {} };
    const res = mockRes();
    withAuth()(req, res, vi.fn());
    assert.strictEqual(res.status.mock.calls.length, 1);
    assert.strictEqual(res.status.mock.calls[0][0], 401);
    assert.strictEqual(res.json.mock.calls[0][0].error, "Unauthorized");
  });

  test("x-forwarded-for remote returns 401", () => {
    const req = { path: "/api/test", headers: { "x-forwarded-for": "10.0.0.1" }, ip: "10.0.0.1", connection: {} };
    const res = mockRes();
    withAuth()(req, res, vi.fn());
    assert.strictEqual(res.status.mock.calls[0][0], 401);
  });

  test("Bearer token passes through", () => {
    vi.stubEnv("BOT_API_TOKEN", "secret-token");
    const req = { path: "/api/test", headers: { authorization: "Bearer secret-token" }, ip: "10.0.0.1", connection: {} };
    const next = vi.fn();
    withAuth()(req, null as any, next);
    assert.strictEqual(next.mock.calls.length, 1);
    vi.unstubAllEnvs();
  });
});

describe("globalRateLimit", () => {
  test("trusted IP bypasses limit", () => {
    const mw = globalRateLimit(0, 60000);
    const req = { ip: "127.0.0.1", headers: {}, connection: {} };
    const next = vi.fn();
    mw(req, null as any, next);
    assert.strictEqual(next.mock.calls.length, 1);
  });

  test("allows requests within limit", () => {
    const mw = globalRateLimit(2, 60000);
    const req = { ip: "10.0.0.1", headers: {}, connection: {} };
    const next1 = vi.fn(), next2 = vi.fn();
    mw(req, null as any, next1);
    mw(req, null as any, next2);
    assert.strictEqual(next1.mock.calls.length, 1);
    assert.strictEqual(next2.mock.calls.length, 1);
  });

  test("blocks requests over limit", () => {
    const mw = globalRateLimit(1, 60000);
    const req = { ip: "10.0.0.1", headers: {}, connection: {} };
    const res = mockRes();
    const next = vi.fn();
    mw(req, null as any, next);
    assert.strictEqual(next.mock.calls.length, 1);
    mw(req, res, vi.fn());
    assert.strictEqual(res.status.mock.calls.length, 1);
    assert.strictEqual(res.status.mock.calls[0][0], 429);
    assert.strictEqual(res.json.mock.calls[0][0].error, "Global rate limit exceeded.");
  });
});

describe("getUserId", () => {
  test("missing returns null", () => {
    assert.strictEqual(getUserId({ headers: {} }), null);
  });

  test("header value returned", () => {
    assert.strictEqual(getUserId({ headers: { "x-discord-user-id": "user123" } }), "user123");
  });
});
