import mongoose, { Schema, Document } from "mongoose";

export interface IHistoryEntry extends Document {
  guildId: string;
  userId: string;
  songTitle: string;
  artist: string;
  identifier: string;
  artworkUrl: string | null;
  timestamp: Date;
}

const HistoryEntrySchema = new Schema<IHistoryEntry>({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  songTitle: { type: String, default: "Unknown" },
  artist: { type: String, default: "" },
  identifier: { type: String, default: "" },
  artworkUrl: { type: String, default: null },
  timestamp: { type: Date, default: Date.now, index: { expires: 7 * 24 * 60 * 60 } },
});

HistoryEntrySchema.index({ guildId: 1, timestamp: -1 });

export default mongoose.model<IHistoryEntry>("HistoryEntry", HistoryEntrySchema);
