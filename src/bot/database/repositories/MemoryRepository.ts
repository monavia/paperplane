import { Memory } from "../models/Memory.js";
import { isUsingPrisma } from "../connection.js";

const MAX_MEMORIES = 50;

let _prisma: any = null;
async function getPrisma() {
  if (!_prisma) _prisma = (await import("../prisma.js")).default;
  return _prisma;
}

async function getMemories(userId: string, limit = 50): Promise<string[]> {
  if (isUsingPrisma()) {
    const p = await getPrisma();
    const docs = await p.memory.findMany({ where: { userId }, orderBy: { timestamp: "desc" }, take: limit });
    return docs.map((d: any) => d.summary).filter(Boolean);
  }
  const docs = await Memory.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
  return docs.map((d: any) => d.summary);
}

async function addMemory(userId: string, summary: string): Promise<void> {
  if (isUsingPrisma()) {
    const p = await getPrisma();
    const count = await p.memory.count({ where: { userId } });
    if (count >= MAX_MEMORIES) {
      const oldest = await p.memory.findFirst({ where: { userId }, orderBy: { timestamp: "asc" } });
      if (oldest) await p.memory.delete({ where: { id: oldest.id } });
    }
    await p.memory.create({ data: { userId, summary } });
    return;
  }
  const count = await Memory.countDocuments({ userId });
  if (count >= 50) {
    const oldest = await Memory.findOne({ userId }).sort({ createdAt: 1 }).lean();
    if (oldest) await Memory.deleteOne({ _id: oldest._id });
  }
  await Memory.create({ userId, summary });
}

export default { getMemories, addMemory };
