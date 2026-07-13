import mongoose, { Schema, Document } from "mongoose";

interface ISongRequest extends Document {
  guildId: string;
  channelId: string;
}

const SongRequestSchema = new Schema<ISongRequest>({
  guildId: { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
});

const SongRequest = mongoose.model<ISongRequest>("SongRequest", SongRequestSchema);

export { SongRequest, ISongRequest };
