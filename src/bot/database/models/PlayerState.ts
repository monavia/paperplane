import { Schema, model } from "mongoose";

const playerStateSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  voiceChannelId: { type: String, required: true },
  textChannelId: { type: String, default: null },
  queue: { type: [Schema.Types.Mixed], default: [] },
  nowPlaying: { type: Schema.Types.Mixed, default: null },
  updatedAt: { type: Date, default: Date.now },
});

export default model("PlayerState", playerStateSchema);
