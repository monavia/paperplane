const isDev = process.env.NODE_ENV !== "production";
const logFormat = process.env.LOG_FORMAT || (isDev ? "pretty" : "json");

const colors: Record<string, string> = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function ts(): string {
  return new Date().toISOString();
}

function color(s: string, c: string): string {
  if (logFormat === "pretty") return `${colors[c]}${s}${colors.reset}`;
  return s;
}

function fmtArg(arg: any): any {
  if (arg instanceof Error) return { message: arg.message, stack: arg.stack };
  if (arg && typeof arg === "object") return arg;
  return String(arg);
}

function extraArgs(args: any[]): Record<string, any> | undefined {
  if (args.length === 0) return undefined;
  if (args.length === 1 && args[0] != null) return { args: fmtArg(args[0]) };
  return { args: args.map(fmtArg) };
}

function log(level: string, msg: string, ...args: any[]) {
  const now = ts();
  const extra = extraArgs(args);

  if (logFormat === "json") {
    const entry: Record<string, any> = { ts: now, level, msg };
    if (extra) Object.assign(entry, extra);
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
    return;
  }

  const tagMap: Record<string, string> = {
    info: "[INFO]",
    warn: "[WARN]",
    error: "[ERROR]",
    ready: "[OK]",
  };
  const colorMap: Record<string, string> = {
    info: "blue",
    warn: "yellow",
    error: "red",
    ready: "green",
  };
  const prefix = `${color(tagMap[level], colorMap[level])}`;
  const line = `[${now}] ${prefix} ${msg}`;
  if (level === "error") console.error(line, ...args);
  else if (level === "warn") console.warn(line, ...args);
  else console.log(line, ...args);
}

const Logger = {
  info: (msg: string, ...args: any[]) => log("info", msg, ...args),
  warn: (msg: string, ...args: any[]) => log("warn", msg, ...args),
  error: (msg: string, ...args: any[]) => log("error", msg, ...args),
  ready: (msg: string) => log("ready", msg),

  /** Silent error handler — logs warning instead of swallowing */
  safe: (tag: string) => (err?: any) => {
    Logger.warn(`[SilentError] ${tag}${err != null ? `: ${err?.message || err}` : ""}`);
  },
};

export default Logger;
