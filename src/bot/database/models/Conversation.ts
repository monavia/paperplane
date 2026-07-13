import mongoose, { Schema, Document } from "mongoose";

interface IConversation extends Document {
  userId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

const ConversationSchema = new Schema<IConversation>({
  userId: { type: String, required: true, index: true },
  role: { type: String, required: true, enum: ["user", "assistant"] },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, index: { expires: "1d" } },
});

ConversationSchema.index({ userId: 1, createdAt: -1 });

const Conversation = mongoose.model<IConversation>("Conversation", ConversationSchema);

export { Conversation, IConversation };
