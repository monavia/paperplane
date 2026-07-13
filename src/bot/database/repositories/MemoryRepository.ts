import { Memory } from "../models/Memory";

async function getMemories(userId: string, limit = 50): Promise<string[]> {
  const docs = await Memory.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
  return docs.map((d: any) => d.summary);
}

async function addMemory(userId: string, summary: string): Promise<void> {
  const count = await Memory.countDocuments({ userId });
  if (count >= 50) {
    const oldest = await Memory.findOne({ userId }).sort({ createdAt: 1 }).lean();
    if (oldest) await Memory.deleteOne({ _id: oldest._id });
  }
  await Memory.create({ userId, summary });
}

export default { getMemories, addMemory };
