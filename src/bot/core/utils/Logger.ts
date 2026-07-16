const isDev = process.env.NODE_ENV !== "production";

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
  if (isDev) return `${colors[c]}${s}${colors.reset}`;
  return s;
}

const Logger = {
  info: (msg: string, ...args: any[]) =>
    console.log(`[${ts()}] ${color("[INFO]", "blue")} ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) =>
    console.warn(`[${ts()}] ${color("[WARN]", "yellow")} ${msg}`, ...args),
  error: (msg: string, ...args: any[]) =>
    console.error(`[${ts()}] ${color("[ERROR]", "red")} ${msg}`, ...args),
  ready: (msg: string) =>
    console.log(`[${ts()}] ${color("[OK]", "green")} ${msg}`),
};

export = Logger;
