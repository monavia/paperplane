import mongoose from "mongoose";

const guildSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  prefix: { type: String, default: "-" },
  volume: { type: Number, default: 80 },
  lastFilter: { type: String, default: "none" },
  lastEqualizer: { type: mongoose.Schema.Types.Mixed, default: null },
  autoplay: { type: Boolean, default: false },
  loop: { type: String, default: "off" },
  shuffle: { type: Boolean, default: false },
  "247": { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

guildSchema.pre("save", function (next: any) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model("Guild", guildSchema);
