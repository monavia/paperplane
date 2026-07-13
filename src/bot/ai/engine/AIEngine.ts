import aiConfig from "../../config/ai";
import PromptBuilder from "./PromptBuilder";
import ConversationMemory from "./ConversationMemory";
import { searchWeb } from "../services/WebSearchService";
import Logger from "../../core/utils/Logger";

const realtimePatterns = [
  /\b(cuaca|weather|hujan|panas|dingin|angin|suhu|temperature|طقس|طقس)\b/i,
  /\b(berita|news|kabar|terkini|أخبار|خبر)\b/i,
  /\b(hari\s+ini|today|sekarang|saat\s+ini|currently|الآن|اليوم)\b/i,
  /\b(besok|tomorrow|kemarin|yesterday|غداً|أمس)\b/i,
  /\b(trending|viral|populer|popular|terbaru|latest)\b/i,
  /\b(harga|price|biaya|cost|سعر|أسعار)\b/i,
  /\b(jam|waktu|time|pukul|الساعة|الوقت)\b/i,
  /\b(tanggal|date|tanggal\s+\d+|الموعد|التاريخ|تاريخ)\b/i,
  /\b(event|acara|konser|konser|حفل|حدث)\b/i,
  /\b(makanan|food|kuliner|makan|طعام|أكل)\b/i,
];

function needsSearch(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return realtimePatterns.some((p) => p.test(normalized));
}

class AIEngine {
  private memory: ConversationMemory;

  constructor() {
    this.memory = new ConversationMemory();
  }

isReady() {
    return !!aiConfig.apiKey;
  }

  clearMemory(userId: any) {
    this.memory.clear(userId);
  }

  private async _fetch(messages: any[], stream?: boolean): Promise<Response> {
    const body: any = {
      model: aiConfig.model,
      messages,
      temperature: aiConfig.temperature,
      max_tokens: aiConfig.maxTokens,
    };
    if (stream) body.stream = true;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${aiConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI error (${response.status}): ${text}`);
      }

      return response;
    } finally {
      clearTimeout(timer);
    }
  }

async ask(userId: any, prompt: any, systemPrompt: any) {
    const messages = await PromptBuilder.build(userId, prompt, systemPrompt, this.memory);

    if (needsSearch(prompt)) {
      Logger.info(`Auto-search for: "${prompt.substring(0, 60)}"`);
      const searchResult = await searchWeb(prompt);
      messages.unshift({ role: "system", content: `Web search results for "${prompt}":\n${searchResult}\n\nAnswer the user's question based on these results. If the results are empty or irrelevant, apologize and say you couldn't find the information.` });
    }

    const response = await this._fetch(messages);
    const data: any = await response.json();
    const answer = data.choices?.[0]?.message?.content || "No response.";
    this.memory.add(userId, prompt, answer);
    return answer;
  }

async stream(userId: any, prompt: any, onChunk: any) {
    const messages = await PromptBuilder.build(userId, prompt, undefined, this.memory);

    if (needsSearch(prompt)) {
      const searchResult = await searchWeb(prompt);
      messages.unshift({ role: "system", content: `Web search results for "${prompt}":\n${searchResult}\n\nAnswer the user based on these results.` });
    }

    const response = await this._fetch(messages, true);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let full = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      for (const line of chunk.split("\n").filter(Boolean)) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6);
          if (jsonStr === "[DONE]") continue;
          try {
            const json = JSON.parse(jsonStr);
            const text = json.choices?.[0]?.delta?.content || "";
            full += text;
            if (onChunk) onChunk(text);
          } catch {}
        }
      }
    }

    this.memory.add(userId, prompt, full);
    return full;
  }
}

export default new AIEngine();
