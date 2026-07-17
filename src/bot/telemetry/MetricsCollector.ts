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

  getAllLabels(): Record<string, number> {
    return { ...this.labels };
  }
}

class Gauge {
  private value = 0;
  private labels: Record<string, number> = {};

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
    return { ...this.labels };
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

export function getMetrics() {
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
  };
}

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
};