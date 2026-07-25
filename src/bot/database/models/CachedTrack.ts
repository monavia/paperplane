import mongoose, { Schema, Document } from "mongoose";

export interface ICachedTrack extends Document {
  identifier: string;
  query: string;
  source: string;
  trackData: any;
  hitCount: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CachedTrackSchema = new Schema<ICachedTrack>({
  identifier: { type: String, required: true, unique: true },
  query: { type: String, default: "" },
  source: { type: String, default: "unknown" },
  trackData: { type: Schema.Types.Mixed, required: true },
  hitCount: { type: Number, default: 0, min: 0 },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 86400000), index: { expires: 0 } },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

CachedTrackSchema.index({ hitCount: -1 });
CachedTrackSchema.index({ source: 1, hitCount: -1 });
CachedTrackSchema.index({ createdAt: -1 });

CachedTrackSchema.pre("save", function () {
  this.updatedAt = new Date();
});

export default mongoose.model<ICachedTrack>("CachedTrack", CachedTrackSchema);
