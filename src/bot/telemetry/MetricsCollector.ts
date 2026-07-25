class Counter {
  private value = 0;
  private labels: Record<string, number> = {};

  inc(labels?: Record<string, string>): void {
    if (labels) {
      const key = JSON.stringify(labels);
      this.labels[key] = (this.labels[key] || 0) + 1;
    }
    this.value++;
  }

  get(labels?: Record<string, string>): number {
    if (labels) {
      const key = JSON.stringify(labels);
      return this.labels[key] || 0;
    }
    return this.value;
  }

  private flattenKey(key: string): string {
    try { const parsed = JSON.parse(key); return Object.values(parsed).join("/"); } catch { return key; }
  }

  getAllLabels(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, val] of Object.entries(this.labels)) result[this.flattenKey(key)] = val;
    return result;
  }
}

class Gauge {
  private value = 0;
  private labels: Record<string, number> = {};

  private flattenKey(key: string): string {
    try { const parsed = JSON.parse(key); return Object.values(parsed).join("/"); } catch { return key; }
  }

  set(val: number, labels?: Record<string, string>): void {
    if (labels) {
      const key = JSON.stringify(labels);
      this.labels[key] = val;
    }
    this.value = val;
  }

  get(labels?: Record<string, string>): number {
    if (labels) {
      const key = JSON.stringify(labels);
      return this.labels[key] ?? this.value;
    }
    return this.value;
  }

  getAllLabels(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, val] of Object.entries(this.labels)) result[this.flattenKey(key)] = val;
    return result;
  }
}

const tracksPlayed = new Counter();
const tracksFailed = new Counter();
const commandsExecuted = new Counter();
const guildCount = new Gauge();
const voiceConnections = new Gauge();
const activePlayers = new Gauge();
const activeGuilds = new Gauge();
const lavalinkNodePlayers = new Gauge();
const lavalinkNodeLatency = new Gauge();
const connectedGuilds = new Gauge();
const rateLimitBlocked = new Counter();
const rateLimitAllowed = new Counter();
const lavalinkNodesOnline = new Gauge();
const lavalinkNodePenalty = new Gauge();
const lavalinkNodeDisconnects = new Counter();
const commandLatency = new Gauge();
const memoryRss = new Gauge();
const memoryHeapUsed = new Gauge();
const memoryHeapTotal = new Gauge();
const eventLoopLag = new Gauge();
const cacheHitCount = new Counter();
const cacheMissCount = new Counter();

let lastLoopMeasure = Date.now();
function measureEventLoopLag(): void {
  const start = Date.now();
  setImmediate(() => {
    const delta = Date.now() - start;
    eventLoopLag.set(delta);
    lastLoopMeasure = Date.now();
  });
}
setInterval(measureEventLoopLag, 10000);

// Periodic memory metric update
setInterval(() => {
  const mem = process.memoryUsage();
  memoryRss.set(mem.rss);
  memoryHeapUsed.set(mem.heapUsed);
  memoryHeapTotal.set(mem.heapTotal);
}, 10000);

export function incTracksPlayed(labels?: Record<string, string>) {
  tracksPlayed.inc(labels);
}
export function incTracksFailed(labels?: Record<string, string>) {
  tracksFailed.inc(labels);
}
export function incCommandsExecuted(labels?: Record<string, string>) {
  commandsExecuted.inc(labels);
}
export function setGuildCount(n: number) {
  guildCount.set(n);
}
export function setVoiceConnections(n: number) {
  voiceConnections.set(n);
}
export function setActivePlayers(n: number) {
  activePlayers.set(n);
}
export function setActiveGuilds(n: number) {
  activeGuilds.set(n);
}
export function setLavalinkNodePlayers(nodeId: string, n: number) {
  lavalinkNodePlayers.set(n, { node: nodeId });
}
export function setLavalinkNodeLatency(nodeId: string, n: number) {
  lavalinkNodeLatency.set(n, { node: nodeId });
}
export function setConnectedGuilds(n: number) {
  connectedGuilds.set(n);
}
export function incRateLimitBlocked() {
  rateLimitBlocked.inc();
}
export function incRateLimitAllowed() {
  rateLimitAllowed.inc();
}
export function setLavalinkNodesOnline(n: number) {
  lavalinkNodesOnline.set(n);
}
export function setLavalinkNodePenalty(nodeId: string, n: number) {
  lavalinkNodePenalty.set(n, { node: nodeId });
}
export function incLavalinkNodeDisconnects(nodeId: string) {
  lavalinkNodeDisconnects.inc({ node: nodeId });
}
export function observeCommandLatency(command: string, ms: number) {
  commandLatency.set(ms, { command });
}
export function incCacheHit(cache: string) {
  cacheHitCount.inc({ cache });
}
export function incCacheMiss(cache: string) {
  cacheMissCount.inc({ cache });
}

export function getMetrics() {
  const mem = process.memoryUsage();
  return {
    tracksPlayed: tracksPlayed.get(),
    tracksPlayedByLabel: tracksPlayed.getAllLabels(),
    tracksFailed: tracksFailed.get(),
    tracksFailedByLabel: tracksFailed.getAllLabels(),
    commandsExecuted: commandsExecuted.get(),
    commandsExecutedByLabel: commandsExecuted.getAllLabels(),
    guildCount: guildCount.get(),
    voiceConnections: voiceConnections.get(),
    activePlayers: activePlayers.get(),
    activeGuilds: activeGuilds.get(),
    lavalinkNodePlayers: lavalinkNodePlayers.getAllLabels(),
    lavalinkNodeLatency: lavalinkNodeLatency.getAllLabels(),
    connectedGuilds: connectedGuilds.get(),
    rateLimitBlocked: rateLimitBlocked.get(),
    rateLimitAllowed: rateLimitAllowed.get(),
    lavalinkNodesOnline: lavalinkNodesOnline.get(),
    lavalinkNodePenalty: lavalinkNodePenalty.getAllLabels(),
    lavalinkNodeDisconnects: lavalinkNodeDisconnects.get(),
    lavalinkNodeDisconnectsByLabel: lavalinkNodeDisconnects.getAllLabels(),
    commandLatency: commandLatency.getAllLabels(),
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
    eventLoopLag: eventLoopLag.get(),
    cacheHit: cacheHitCount.get(),
    cacheHitByLabel: cacheHitCount.getAllLabels(),
    cacheMiss: cacheMissCount.get(),
    cacheMissByLabel: cacheMissCount.getAllLabels(),
  };
}

import * as EventBus from "../music/events/EventBus.js";

EventBus.on('metrics:trackPlayed', (p: any) => {
  if (p?.guildId) {
    tracksPlayed.inc({ guild: p.guildId, source: p.source || 'unknown' });
  }
  incTracksPlayed();
});

EventBus.on('metrics:trackFailed', (p: any) => {
  if (p?.guildId) {
    const errMsg = p.error?.error || p.error?.exception?.message || "Unknown";
    tracksFailed.inc({ error_type: errMsg.substring(0, 50) });
  }
  incTracksFailed();
});

export function metricsMiddleware(_req: any, _res: any, next: any) {
  next();
}

export default {
  tracksPlayed,
  tracksFailed,
  commandsExecuted,
  guildCount,
  voiceConnections,
  activePlayers,
  activeGuilds,
  lavalinkNodePlayers,
  lavalinkNodeLatency,
  connectedGuilds,
  rateLimitBlocked,
  rateLimitAllowed,
  lavalinkNodesOnline,
  lavalinkNodePenalty,
  lavalinkNodeDisconnects,
  commandLatency,
  cacheHitCount,
  cacheMissCount,
};