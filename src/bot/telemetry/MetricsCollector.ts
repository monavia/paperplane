const counter = () => ({ inc: (_labels?: Record<string, string>) => {} });
const gauge = () => ({ set: (_labels: Record<string, string> | number, _value?: number) => {} });

const metrics = {
  tracksPlayed: counter(), tracksFailed: counter(), commandsExecuted: counter(),
  guildCount: { set: (_n: number) => {} }, voiceConnections: { set: (_n: number) => {} },
  activePlayers: { set: (_n: number) => {} }, activeGuilds: { set: (_n: number) => {} },
  lavalinkNodePlayers: { set: (_labels: Record<string, string> | string, _n?: number) => {} },
  lavalinkNodeLatency: { set: (_labels: Record<string, string> | string, _n?: number) => {} },
  connectedGuilds: { set: (_n: number) => {} },
  rateLimitBlocked: counter(), rateLimitAllowed: counter(),
  lavalinkNodesOnline: { set: (_n: number) => {} },
  lavalinkNodePenalty: { set: (_labels: Record<string, string>, _n: number) => {} },
};

export default metrics;

export function metricsMiddleware(_req: any, _res: any, next: any): void {
  next();
}
