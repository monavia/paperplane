import Guild from "../models/Guild";
import botConfig from "../../config/bot";
import { isUsingPrisma } from "../connection";

const prefixCache = new Map<string, { prefix: string; ts: number }>();
const CACHE_TTL = 60000;

let _prisma: any = null;
async function getPrisma() {
  if (!_prisma) _prisma = (await import("../prisma")).default;
  return _prisma;
}

function usePg() {
  return isUsingPrisma();
}

export async function getPrefix(guildId: string): Promise<string> {
  const cached = prefixCache.get(guildId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.prefix;
  try {
    let prefix: string;
    if (usePg()) {
      const p = await getPrisma();
      const g = await p.guild.findUnique({ where: { guildId }, select: { prefix: true } });
      prefix = g?.prefix || botConfig.prefix;
    } else {
      const g = await Guild.findOne({ guildId }).lean();
      prefix = (g as any)?.prefix || botConfig.prefix;
    }
    prefixCache.set(guildId, { prefix, ts: Date.now() });
    return prefix;
  } catch { return botConfig.prefix; }
}

export async function setPrefix(guildId: string, prefix: string): Promise<void> {
  prefixCache.set(guildId, { prefix, ts: Date.now() });
  if (usePg()) {
    const p = await getPrisma();
    await p.guild.upsert({ where: { guildId }, update: { prefix }, create: { guildId, prefix } });
  } else {
    await Guild.updateOne({ guildId }, { $set: { prefix } }, { upsert: true });
  }
}

export async function updateVolume(guildId: string, volume: number): Promise<void> {
  if (usePg()) {
    const p = await getPrisma();
    await p.guild.upsert({ where: { guildId }, update: { volume }, create: { guildId, volume } });
  } else {
    await Guild.updateOne({ guildId }, { $set: { volume } }, { upsert: true });
  }
}

export async function setLastFilter(guildId: string, filter: string): Promise<void> {
  if (usePg()) {
    const p = await getPrisma();
    await p.guild.upsert({ where: { guildId }, update: { lastFilter: filter }, create: { guildId, lastFilter: filter } });
  } else {
    await Guild.updateOne({ guildId }, { $set: { lastFilter: filter } }, { upsert: true });
  }
}

export async function getLastFilter(guildId: string): Promise<string> {
  try {
    if (usePg()) {
      const p = await getPrisma();
      const g = await p.guild.findUnique({ where: { guildId }, select: { lastFilter: true } });
      return g?.lastFilter || "none";
    }
    const guild = await Guild.findOne({ guildId }).lean();
    return (guild as any)?.lastFilter || "none";
  } catch { return "none"; }
}

export async function setLastEqualizer(guildId: string, bands: any): Promise<void> {
  if (usePg()) {
    const p = await getPrisma();
    await p.guild.upsert({ where: { guildId }, update: { lastEqualizer: bands }, create: { guildId, lastEqualizer: bands } });
  } else {
    await Guild.updateOne({ guildId }, { $set: { lastEqualizer: bands } }, { upsert: true });
  }
}

export async function getLastEqualizer(guildId: string): Promise<any> {
  try {
    if (usePg()) {
      const p = await getPrisma();
      const g = await p.guild.findUnique({ where: { guildId }, select: { lastEqualizer: true } });
      return g?.lastEqualizer ?? null;
    }
    const guild = await Guild.findOne({ guildId }).lean();
    return (guild as any)?.lastEqualizer ?? null;
  } catch { return null; }
}
