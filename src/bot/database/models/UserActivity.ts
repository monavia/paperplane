import mongoose, { Schema, Document } from "mongoose";

interface IUserActivity extends Document {
  guildId: string;
  userId: string;
  action: string;
  detail: string;
  timestamp: Date;
}

const UserActivitySchema = new Schema<IUserActivity>({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  action: { type: String, required: true },
  detail: { type: String, default: "" },
  timestamp: { type: Date, default: Date.now },
});

UserActivitySchema.index({ guildId: 1, timestamp: -1 });

export default mongoose.model<IUserActivity>("UserActivity", UserActivitySchema);
