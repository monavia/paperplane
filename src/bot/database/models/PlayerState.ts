import { Schema, model, Document } from "mongoose";

export interface IPlayerState extends Document {
  guildId: string;
  voiceChannelId: string;
  textChannelId: string | null;
  queue: any[];
  nowPlaying: any;
  position: number;
  nodeId: string | null;
  updatedAt: Date;
}

const playerStateSchema = new Schema({
  guildId: { type: String, required: true, unique: true },
  voiceChannelId: { type: String, required: true },
  textChannelId: { type: String, default: null },
  queue: { type: [Schema.Types.Mixed], default: [] },
  nowPlaying: { type: Schema.Types.Mixed, default: null },
  position: { type: Number, default: 0 },
  nodeId: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now },
});

export default model<IPlayerState>("PlayerState", playerStateSchema);