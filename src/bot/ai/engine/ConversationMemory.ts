import { Conversation } from "../../database/models/Conversation";

const MAX_SESSIONS = Number(process.env.AI_MEMORY_MAX_SESSIONS) || 5000;
const TTL_MS = Number(process.env.AI_MEMORY_TTL_MS) || 30 * 60 * 1000;

interface CacheEntry {
  history: any[];
  ts: number;
}

class ConversationMemory {
  private _sessions: Map<string, CacheEntry> = new Map();

  private _get(userId: any): any[] | null {
    const entry = this._sessions.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.ts > TTL_MS) {
      this._sessions.delete(userId);
      return null;
    }
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

    const docs = await Conversation.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    const history = docs.reverse().map((d: any) => ({
      user: d.role === "user" ? d.content : "",
      assistant: d.role === "assistant" ? d.content : "",
      timestamp: d.createdAt.getTime(),
    }));

    const merged: any[] = [];
    for (const h of history) {
      const last = merged[merged.length - 1];
      if (h.user && last && !last.user) {
        last.user = h.user;
      } else if (h.assistant && last && last.user && !last.assistant) {
        last.assistant = h.assistant;
      } else {
        merged.push({ ...h });
      }
    }

    if (merged.length > 20) merged.splice(0, merged.length - 20);
    this._set(userId, merged);
    return merged;
  }

  async add(userId: any, prompt: any, response: any) {
    if (!prompt?.trim() || !response?.trim()) return;
    await Conversation.insertMany([
      { userId, role: "user", content: prompt },
      { userId, role: "assistant", content: response },
    ]);

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
    await Conversation.deleteMany({ userId });
    this._sessions.delete(userId);
  }

  async hasHistory(userId: any) {
    const cached = this._get(userId);
    if (cached && cached.length > 0) return true;
    const count = await Conversation.countDocuments({ userId }).limit(1);
    return count > 0;
  }
}

export default ConversationMemory;
