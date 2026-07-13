import mongoose, { Schema, Document } from "mongoose";

interface IMemory extends Document {
  userId: string;
  summary: string;
  createdAt: Date;
}

const MemorySchema = new Schema<IMemory>({
  userId: { type: String, required: true, index: true },
  summary: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, index: { expires: "14d" } },
});

MemorySchema.index({ userId: 1, createdAt: -1 });

const Memory = mongoose.model<IMemory>("Memory", MemorySchema);

export { Memory, IMemory };
