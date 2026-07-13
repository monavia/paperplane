import mongoose, { Schema, Document } from "mongoose";

export interface IHistoryEntry extends Document {
  guildId: string;
  userId: string;
  track: any;
  playedAt: Date;
}

const HistoryEntrySchema = new Schema<IHistoryEntry>({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  track: { type: Schema.Types.Mixed, required: true },
  playedAt: { type: Date, default: Date.now, index: { expires: 7 * 24 * 60 * 60 } },
});

HistoryEntrySchema.index({ guildId: 1, playedAt: -1 });

export default mongoose.model<IHistoryEntry>("HistoryEntry", HistoryEntrySchema);
