import mongoose, { Schema, Document } from "mongoose";

interface IActivity extends Document {
  guildId: string;
  userId: string;
  action: string;
  detail: string;
  timestamp: Date;
}

const ActivitySchema = new Schema<IActivity>({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  action: { type: String, required: true },
  detail: { type: String, default: "" },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.model<IActivity>("Activity", ActivitySchema);
