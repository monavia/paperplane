import Guild from "../models/Guild";
import botConfig from "../../config/bot";

const prefixCache = new Map<string, { prefix: string; ts: number }>();
const CACHE_TTL = 60000;

export async function getPrefix(guildId: string): Promise<string> {
  const cached = prefixCache.get(guildId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.prefix;
  }
  try {
    const guild = await Guild.findOne({ guildId }).lean();
    const prefix = guild?.prefix || botConfig.prefix;
    prefixCache.set(guildId, { prefix, ts: Date.now() });
    return prefix;
  } catch {
    return botConfig.prefix;
  }
}

export async function setPrefix(guildId: string, prefix: string): Promise<void> {
  prefixCache.set(guildId, { prefix, ts: Date.now() });
  await Guild.updateOne({ guildId }, { $set: { prefix } }, { upsert: true });
}

export async function updateVolume(guildId: string, volume: number): Promise<void> {
  await Guild.updateOne({ guildId }, { $set: { volume } }, { upsert: true });
}

export async function setLastFilter(guildId: string, filter: string): Promise<void> {
  await Guild.updateOne({ guildId }, { $set: { lastFilter: filter } }, { upsert: true });
}

export async function getLastFilter(guildId: string): Promise<string> {
  try {
    const guild = await Guild.findOne({ guildId }).lean();
    return (guild as any)?.lastFilter || "none";
  } catch { return "none"; }
}

export async function setLastEqualizer(guildId: string, bands: any): Promise<void> {
  await Guild.updateOne({ guildId }, { $set: { lastEqualizer: bands } }, { upsert: true });
}

export async function getLastEqualizer(guildId: string): Promise<string> {
  try {
    const guild = await Guild.findOne({ guildId }).lean();
    return (guild as any)?.lastEqualizer || "none";
  } catch { return "none"; }
}


