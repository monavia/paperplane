import Logger from "../../core/utils/Logger";
import Guild from "../models/Guild";
import botConfig from "../../config/bot";
import { isUsingPrisma } from "../connection";

const prefixCache = new Map<string, { prefix: string; ts: number }>();
const CACHE_TTL = 60000;

let _prisma: any = null;
async function getPrisma() {
  if (!_prisma) _prisma = (await import("../prisma.js")).default;
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
  } catch { Logger.warn(`[GuildRepo] getPrefix failed for ${guildId}`); return botConfig.prefix; }
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
  } catch { Logger.warn(`[GuildRepo] getLastFilter failed for ${guildId}`); return "none"; }
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
  } catch { Logger.warn(`[GuildRepo] getLastEqualizer failed for ${guildId}`); return null; }
}

export async function getAutoplay(guildId: string): Promise<boolean> {
  try {
    if (usePg()) {
      const p = await getPrisma();
      const g = await p.guild.findUnique({ where: { guildId }, select: { autoplay: true } });
      return g?.autoplay ?? false;
    }
    const g = await Guild.findOne({ guildId }).lean();
    return (g as any)?.autoplay ?? false;
  } catch { Logger.warn(`[GuildRepo] getter failed for ${guildId}`); return false; }
}

export async function setAutoplay(guildId: string, enabled: boolean): Promise<void> {
  if (usePg()) {
    const p = await getPrisma();
    await p.guild.upsert({ where: { guildId }, update: { autoplay: enabled }, create: { guildId, autoplay: enabled } });
  } else {
    await Guild.updateOne({ guildId }, { $set: { autoplay: enabled } }, { upsert: true });
  }
}

export async function getLoop(guildId: string): Promise<string> {
  try {
    if (usePg()) {
      const p = await getPrisma();
      const g = await p.guild.findUnique({ where: { guildId }, select: { loop: true } });
      return g?.loop || "off";
    }
    const g = await Guild.findOne({ guildId }).lean();
    return (g as any)?.loop || "off";
  } catch { Logger.warn(`[GuildRepo] getLoop failed for ${guildId}`); return "off"; }
}

export async function setLoop(guildId: string, mode: string): Promise<void> {
  if (usePg()) {
    const p = await getPrisma();
    await p.guild.upsert({ where: { guildId }, update: { loop: mode }, create: { guildId, loop: mode } });
  } else {
    await Guild.updateOne({ guildId }, { $set: { loop: mode } }, { upsert: true });
  }
}

export async function getShuffle(guildId: string): Promise<boolean> {
  try {
    if (usePg()) {
      const p = await getPrisma();
      const g = await p.guild.findUnique({ where: { guildId }, select: { shuffle: true } });
      return g?.shuffle ?? false;
    }
    const g = await Guild.findOne({ guildId }).lean();
    return (g as any)?.shuffle ?? false;
  } catch { Logger.warn(`[GuildRepo] getter failed for ${guildId}`); return false; }
}

export async function setShuffle(guildId: string, enabled: boolean): Promise<void> {
  if (usePg()) {
    const p = await getPrisma();
    await p.guild.upsert({ where: { guildId }, update: { shuffle: enabled }, create: { guildId, shuffle: enabled } });
  } else {
    await Guild.updateOne({ guildId }, { $set: { shuffle: enabled } }, { upsert: true });
  }
}

export async function get247(guildId: string): Promise<boolean> {
  try {
    if (usePg()) {
      const p = await getPrisma();
      const g = await p.guild.findUnique({ where: { guildId }, select: { is247: true } });
      return g?.is247 ?? false;
    }
    const g = await Guild.findOne({ guildId }).lean();
    return (g as any)?.["247"] ?? false;
  } catch { Logger.warn(`[GuildRepo] getter failed for ${guildId}`); return false; }
}

export async function set247(guildId: string, enabled: boolean): Promise<void> {
  if (usePg()) {
    const p = await getPrisma();
    await p.guild.upsert({ where: { guildId }, update: { is247: enabled }, create: { guildId, is247: enabled } });
  } else {
    await Guild.updateOne({ guildId }, { $set: { "247": enabled } }, { upsert: true });
  }
}
