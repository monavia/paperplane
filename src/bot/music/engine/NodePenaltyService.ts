import Logger from "../../core/utils/Logger";
import { setLavalinkNodePenalty } from "../../telemetry/MetricsCollector";

interface NodeMetrics {
  failedLoads: number;
  disconnects: number;
  errors: number;
  responseTimes: number[];
  lastError: string;
  lastErrorAt: number;
}

const metrics = new Map<string, NodeMetrics>();
let decayTimer: ReturnType<typeof setInterval> | null = null;
const drainingNodes = new Set<string>();

const PENALTY_FAILED_LOAD = 50;
const PENALTY_DISCONNECT = 100;
const PENALTY_ERROR = 75;
const PENALTY_HIGH_LATENCY = 50;
const LATENCY_THRESHOLD = 800;

type StrategyType = "penalty" | "roundrobin" | "leastplayers";

const STRATEGY: StrategyType = (process.env.LOAD_BALANCE_STRATEGY as StrategyType) || "penalty";
let roundRobinIndex = 0;

function getOrCreate(name: string): NodeMetrics {
  if (!metrics.has(name)) {
    metrics.set(name, { failedLoads: 0, disconnects: 0, errors: 0, responseTimes: [], lastError: "", lastErrorAt: 0 });
  }
  return metrics.get(name)!;
}

function recordFailedLoad(nodeName: string): void { getOrCreate(nodeName).failedLoads++; }
function recordDisconnect(nodeName: string): void { getOrCreate(nodeName).disconnects++; }
function recordError(nodeName: string, message: string): void {
  const m = getOrCreate(nodeName);
  m.errors++; m.lastError = message; m.lastErrorAt = Date.now();
  setLavalinkNodePenalty(nodeName, getPenalty(nodeName));
}
function recordResponseTime(nodeName: string, ms: number): void {
  const m = getOrCreate(nodeName);
  m.responseTimes.push(ms);
  if (m.responseTimes.length > 20) m.responseTimes.shift();
}

function getPenalty(nodeName: string): number {
  const m = metrics.get(nodeName);
  if (!m) return 0;
  let penalty = m.failedLoads * PENALTY_FAILED_LOAD + m.disconnects * PENALTY_DISCONNECT + m.errors * PENALTY_ERROR;
  if (m.responseTimes.length > 0) {
    const avg = m.responseTimes.reduce((a, b) => a + b, 0) / m.responseTimes.length;
    if (avg > LATENCY_THRESHOLD) penalty += PENALTY_HIGH_LATENCY;
  }
  return penalty;
}

function isDraining(nodeName: string): boolean { return drainingNodes.has(nodeName); }
function startDrain(nodeName: string): void { drainingNodes.add(nodeName); }
function stopDrain(nodeName: string): void { drainingNodes.delete(nodeName); }
function getDrainingNodes(): string[] { return Array.from(drainingNodes); }

function getBestNode(manager: any, preferredRegion?: string): any {
  if (!manager?.nodeManager?.nodes) return null;
  const connected = Array.from(manager.nodeManager.nodes.values())
    .filter((n: any) => n.connected && !drainingNodes.has(n.options?.name || n.name));
  if (!connected.length) return null;

  if (preferredRegion) {
    const regionNodes = connected.filter((n: any) => (n.options?.regions || []).includes(preferredRegion.toLowerCase()));
    if (regionNodes.length > 0) {
      regionNodes.sort(scoreSorter);
      return regionNodes[0];
    }
  }

  if (STRATEGY === "roundrobin") return selectRoundRobin(connected);
  if (STRATEGY === "leastplayers") return selectLeastPlayers(connected);
  return selectPenalty(connected);
}

function scoreSorter(a: any, b: any): number {
  return a.stats?.players * 10 + getPenalty(a.options?.name || a.name) - (b.stats?.players * 10 + getPenalty(b.options?.name || b.name));
}

function selectPenalty(connected: any[]): any {
  connected.sort(scoreSorter);
  return connected[0];
}

function selectRoundRobin(connected: any[]): any {
  const idx = roundRobinIndex % connected.length;
  roundRobinIndex = (roundRobinIndex + 1) % connected.length;
  return connected[idx];
}

function selectLeastPlayers(connected: any[]): any {
  return connected.reduce((best, n) => (n.stats?.players ?? Infinity) < (best.stats?.players ?? Infinity) ? n : best);
}

function decay(): void {
  for (const [, m] of metrics) {
    m.failedLoads = Math.floor(m.failedLoads * 0.5);
    m.disconnects = Math.floor(m.disconnects * 0.5);
    m.errors = Math.floor(m.errors * 0.5);
    if (m.responseTimes.length > 0) m.responseTimes = m.responseTimes.slice(Math.ceil(m.responseTimes.length / 2));
  }
}

function startDecay(intervalMs = 300000): void {
  if (decayTimer) return;
  decayTimer = setInterval(decay, intervalMs);
}

function stopDecay(): void { if (decayTimer) { clearInterval(decayTimer); decayTimer = null; } }

export {
  recordFailedLoad, recordDisconnect, recordError, recordResponseTime,
  getPenalty, getBestNode, startDecay, stopDecay, isDraining, startDrain, stopDrain, getDrainingNodes,
};
