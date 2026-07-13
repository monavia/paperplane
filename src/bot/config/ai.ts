import "dotenv/config";

export default {
  apiKey: process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY || "",
  model: process.env.AI_MODEL || process.env.OPENROUTER_MODEL || "qwen2.5:7b",
  baseUrl: process.env.AI_BASE_URL || "https://openrouter.ai/api/v1",
  temperature: Number(process.env.AI_TEMPERATURE) || 0.7,
  maxTokens: Number(process.env.AI_MAX_TOKENS) || 2048,
};
