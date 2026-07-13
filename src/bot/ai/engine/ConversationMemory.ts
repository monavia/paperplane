import { Conversation } from "../../database/models/Conversation";
import { isUsingPrisma } from "../../database/connection";

const MAX_SESSIONS = Number(process.env.AI_MEMORY_MAX_SESSIONS) || 5000;
const TTL_MS = Number(process.env.AI_MEMORY_TTL_MS) || 30 * 60 * 1000;

let _prisma: any = null;
async function getPrisma() {
  if (!_prisma) _prisma = (await import("../../database/prisma")).default;
  return _prisma;
}
function usePg() { return isUsingPrisma(); }

interface CacheEntry {
  history: any[];
  ts: number;
}

class ConversationMemory {
  private _sessions: Map<string, CacheEntry> = new Map();

  private _get(userId: any): any[] | null {
    const entry = this._sessions.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.ts > TTL_MS) { this._sessions.delete(userId); return null; }
    this._sessions.delete(userId);
    this._sessions.set(userId, entry);
    return entry.history;
  }

  private _set(userId: any, history: any[]): void {
    this._sessions.set(userId, { history, ts: Date.now() });
    if (this._sessions.size > MAX_SESSIONS) {
      const oldest = this._sessions.keys().next().value;
      if (oldest !== undefined) this._sessions.delete(oldest);
    }
  }

  async getHistory(userId: any) {
    const cached = this._get(userId);
    if (cached) return cached;

    let docs: any[];
    if (usePg()) {
      const p = await getPrisma();
      docs = await p.conversation.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 });
    } else {
      docs = await Conversation.find({ userId }).sort({ createdAt: -1 }).limit(20).lean();
    }
    const history = docs.reverse().map((d: any) => ({
      user: d.role === "user" ? d.content : "",
      assistant: d.role === "assistant" ? d.content : "",
      timestamp: d.createdAt?.getTime ? d.createdAt.getTime() : d.createdAt,
    }));

    const merged: any[] = [];
    for (const h of history) {
      const last = merged[merged.length - 1];
      if (h.user && last && !last.user) { last.user = h.user; }
      else if (h.assistant && last && last.user && !last.assistant) { last.assistant = h.assistant; }
      else { merged.push({ ...h }); }
    }
    if (merged.length > 20) merged.splice(0, merged.length - 20);
    this._set(userId, merged);
    return merged;
  }

  async add(userId: any, prompt: any, response: any) {
    if (!prompt?.trim() || !response?.trim()) return;

    if (usePg()) {
      const p = await getPrisma();
      await p.conversation.createMany({ data: [
        { userId, role: "user", content: prompt, createdAt: new Date() },
        { userId, role: "assistant", content: response, createdAt: new Date() },
      ] }).catch(() => {});
    } else {
      await Conversation.insertMany([
        { userId, role: "user", content: prompt },
        { userId, role: "assistant", content: response },
      ]).catch(() => {});
    }

    const existing = this._sessions.get(userId);
    if (existing) {
      existing.history.push({ user: prompt, assistant: response, timestamp: Date.now() });
      if (existing.history.length > 20) existing.history.splice(0, existing.history.length - 20);
      existing.ts = Date.now();
    } else {
      this._set(userId, [{ user: prompt, assistant: response, timestamp: Date.now() }]);
    }
  }

  async clear(userId: any) {
    if (usePg()) {
      const p = await getPrisma();
      await p.conversation.deleteMany({ where: { userId } }).catch(() => {});
    } else {
      await Conversation.deleteMany({ userId }).catch(() => {});
    }
    this._sessions.delete(userId);
  }

  async hasHistory(userId: any) {
    const cached = this._get(userId);
    if (cached && cached.length > 0) return true;
    if (usePg()) {
      const p = await getPrisma();
      const count = await p.conversation.count({ where: { userId } });
      return count > 0;
    }
    const count = await Conversation.countDocuments({ userId }).limit(1);
    return count > 0;
  }
}

export default ConversationMemory;
