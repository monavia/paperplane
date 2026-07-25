import { describe, test, beforeAll, vi } from "vitest";
import assert from "node:assert";
import { createTestServer } from "./harness.js";

vi.mock("@/bot/cache/redis.js", () => ({
  isAvailable: () => false,
  getCache: () => null,
  init: () => {},
  shutdown: () => {},
}));

vi.mock("@/bot/music/engine/lavalink.js", () => ({
  getClient: () => ({
    guilds: {
      cache: {
        size: 0,
        values: () => [][Symbol.iterator](),
        get: () => undefined,
      },
    },
    user: { tag: "test" },
  }),
  get: () => null,
  getConnectedNodes: () => [],
  getLeastLoadedNode: () => null,
  cacheTrack: () => {},
  getCachedTrack: () => null,
  clearTrackCache: () => {},
}));

vi.mock("mongoose", () => {
  const Mixed = {};
  const Schema = { Types: { Mixed } };
  const model = () => {};
  return {
    default: { connection: { readyState: 1 }, Schema, model },
    connection: { readyState: 1 },
    Schema,
    model,
  };
});

vi.mock("@sentry/node", () => ({
  setupExpressErrorHandler: () => {},
  captureException: () => {},
}));

vi.mock("@/bot/telemetry/MetricsCollector.js", () => ({
  getMetrics: () => ({
    tracksPlayed: 0, tracksPlayedByLabel: {},
    tracksFailed: 0, tracksFailedByLabel: {},
    commandsExecuted: 0, commandsExecutedByLabel: {},
    guildCount: 0, voiceConnections: 0, activePlayers: 0, activeGuilds: 0,
    lavalinkNodePlayers: {}, lavalinkNodeLatency: {}, connectedGuilds: 0,
    rateLimitBlocked: 0, rateLimitAllowed: 0,
    lavalinkNodesOnline: 0, lavalinkNodePenalty: {},
    lavalinkNodeDisconnects: 0, lavalinkNodeDisconnectsByLabel: {},
    commandLatency: {}, memory: { rss: 0, heapUsed: 0, heapTotal: 0 },
    eventLoopLag: 0, cacheHit: 0, cacheHitByLabel: {}, cacheMiss: 0, cacheMissByLabel: {},
  }),
  incRateLimitBlocked: () => {},
  incRateLimitAllowed: () => {},
  incCommandsExecuted: () => {},
  observeCommandLatency: () => {},
  setGuildCount: () => {},
  setVoiceConnections: () => {},
  setActivePlayers: () => {},
  setActiveGuilds: () => {},
  setLavalinkNodePlayers: () => {},
  setLavalinkNodeLatency: () => {},
  setLavalinkNodesOnline: () => {},
  setLavalinkNodePenalty: () => {},
  incLavalinkNodeDisconnects: () => {},
  incCacheHit: () => {},
  incCacheMiss: () => {},
  incTracksPlayed: () => {},
  incTracksFailed: () => {},
}));

vi.mock("@/bot/database/repositories/GuildRepository.js", () => ({
  getPrefix: () => "-",
  setPrefix: () => {},
  getAutoplay: () => false,
  setAutoplay: () => {},
  getLoop: () => "none",
  setLoop: () => {},
  getShuffle: () => false,
  setShuffle: () => {},
  get247: () => false,
  set247: () => {},
  updateVolume: () => {},
  getLastFilter: () => "none",
  setLastFilter: () => {},
  getLastEqualizer: () => "flat",
  setLastEqualizer: () => {},
}));

vi.mock("@/bot/music/services/PlayerService.js", () => ({
  getEngine: () => ({ player: null }),
  play: () => {},
  stop: () => {},
  skip: () => {},
  pause: () => {},
  resume: () => {},
  setVolume: () => {},
  seek: () => {},
  setFilter: () => {},
  setEqualizer: () => {},
  resetFilters: () => {},
  destroyEngine: () => {},
  search: () => ({ tracks: [] }),
  resolveAndQueueTracks: () => [],
}));

vi.mock("@/bot/music/services/QueueService.js", () => ({
  getQueue: () => [],
  removeFromQueue: () => {},
  swapTracks: () => {},
  moveTrack: () => {},
  clearQueue: () => {},
}));

vi.mock("@/bot/music/engine/PlayerManager.js", () => ({
  getVoiceJoinDuration: () => 0,
}));

vi.mock("@/bot/music/services/HistoryService.js", () => ({
  getHistory: () => [],
}));

vi.mock("@/bot/music/services/LyricsService.js", () => ({
  fetchLyrics: () => null,
}));

vi.mock("@/bot/music/services/TextChannelStore.js", () => ({
  getTextChannelId: () => null,
  setTextChannelId: () => {},
}));

let app: any;
let request: any;

beforeAll(async () => {
  process.env.API_PORT = "0";
  process.env.API_HOST = "127.0.0.1";
  const server = await createTestServer();
  app = server.app;
  request = server.request;
});

describe("GET /api/health", () => {
  test("returns 200 with status ok", async () => {
    const res = await request.get("/api/health");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.status, "ok");
    assert.ok(typeof res.body.data.uptime === "number");
    assert.ok(typeof res.body.data.guilds === "number");
    assert.ok(res.body.data.database);
    assert.ok(res.body.data.redis);
    assert.ok(res.body.data.lavalink);
    assert.ok(res.body.data.memory);
  });
});

describe("GET /api/metrics", () => {
  test("returns 200 with text/plain", async () => {
    const res = await request.get("/api/metrics");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers["content-type"], "text/plain; charset=utf-8");
    assert.ok(res.text.includes("paperplane_tracks_played"));
  });
});

describe("GET /api/guilds", () => {
  test("returns 200 with guild list", async () => {
    const res = await request.get("/api/guilds");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
  });
});

describe("GET /api/guild/:guildId/equalizer", () => {
  test("returns current equalizer preset", async () => {
    const res = await request.get("/api/guild/12345678901234567/equalizer");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.current, "flat");
    assert.ok(Array.isArray(res.body.data.presets));
  });
});

describe("GET /api/guild/:guildId/queue", () => {
  test("returns queue for valid guildId", async () => {
    const res = await request.get("/api/guild/12345678901234567/queue");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  test("returns 400 for invalid guildId", async () => {
    const res = await request.get("/api/guild/invalid/queue");
    assert.strictEqual(res.status, 400);
  });
});

describe("POST /api/guild/:guildId/player", () => {
  test("returns 200 (no userId = system/trusted ip bypass)", async () => {
    const res = await request
      .post("/api/guild/12345678901234567/player")
      .send({ action: "stop" });
    assert.strictEqual(res.status, 200);
  });

  test("returns 400 for unknown action", async () => {
    const res = await request
      .post("/api/guild/12345678901234567/player")
      .send({ action: "fly" });
    assert.strictEqual(res.status, 400);
  });
});

describe("GET /api/guild/:guildId/insights", () => {
  test("returns insights", async () => {
    const res = await request.get("/api/guild/12345678901234567/insights");
    assert.strictEqual(res.status, 200);
  });
});

describe("Auth — /api/health exempt", () => {
  test("health returns 200 without auth", async () => {
    const res = await request.get("/api/health");
    assert.strictEqual(res.status, 200);
  });
});

describe("Auth — protected routes via trusted IP", () => {
  test("protected route returns 200 (127.0.0.1 trusted)", async () => {
    const res = await request.get("/api/guild/12345678901234567/queue");
    assert.strictEqual(res.status, 200);
  });
});
