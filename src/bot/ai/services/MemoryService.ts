import aiConfig from "../../config/ai";
import MemoryRepository from "../../database/repositories/MemoryRepository";
import Logger from "../../core/utils/Logger";

async function generateSummary(userPrompt: string, aiReply: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: "system", content: "Summarize what the bot learned about the user from this exchange in 1 short sentence (max 15 words). Focus on user's preferences, interests, or personal info. If nothing notable, respond with 'nothing'." },
          { role: "user", content: userPrompt },
          { role: "assistant", content: aiReply },
        ],
        temperature: 0.3,
        max_tokens: 50,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const data: any = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text || text.toLowerCase() === "nothing") return null;
    return text;
  } catch {
    return null;
  }
}

async function saveMemory(userId: string, userPrompt: string, aiReply: string): Promise<void> {
  try {
    const summary = await generateSummary(userPrompt, aiReply);
    if (summary) {
      await MemoryRepository.addMemory(userId, summary);
      Logger.info(`Memory saved for ${userId}: ${summary}`);
    }
  } catch {}
}

async function getMemoryContext(userId: string): Promise<string> {
  const memories = await MemoryRepository.getMemories(userId);
  if (memories.length === 0) return "";
  return "Bot's memory about this user:\n" + memories.join("\n");
}

export default { saveMemory, getMemoryContext };
