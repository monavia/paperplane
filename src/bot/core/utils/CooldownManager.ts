interface CooldownEntry {
  lastUsed: number;
  uses: number;
}

class CooldownManager {
  private _cooldowns: Map<string, CooldownEntry> = new Map();

  private _key(userId: string, command: string): string {
    return `${userId}:${command}`;
  }

  check(userId: string, command: string, cooldownMs = 3000): boolean {
    const entry = this._cooldowns.get(this._key(userId, command));
    if (!entry) return true;
    return Date.now() - entry.lastUsed >= cooldownMs;
  }

  set(userId: string, command: string): void {
    const key = this._key(userId, command);
    const existing = this._cooldowns.get(key);
    this._cooldowns.set(key, { lastUsed: Date.now(), uses: (existing?.uses ?? 0) + 1 });
  }

  getRemaining(userId: string, command: string, cooldownMs = 3000): number {
    const entry = this._cooldowns.get(this._key(userId, command));
    if (!entry) return 0;
    return Math.max(0, cooldownMs - (Date.now() - entry.lastUsed));
  }

  reset(userId: string, command?: string): void {
    if (command) { this._cooldowns.delete(this._key(userId, command)); }
    else { for (const key of this._cooldowns.keys()) { if (key.startsWith(`${userId}:`)) this._cooldowns.delete(key); } }
  }

  getUses(userId: string, command: string): number {
    return this._cooldowns.get(this._key(userId, command))?.uses ?? 0;
  }

  size(): number { return this._cooldowns.size; }
}

export default new CooldownManager();
