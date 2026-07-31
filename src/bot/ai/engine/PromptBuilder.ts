import MemoryService from "../services/MemoryService.js";
import { PERSONA } from "../config/persona.js";

class PromptBuilder {
  static async build(userId: any, prompt: any, systemOverride: any, memory: any) {
    const system = systemOverride || PERSONA;
    const history = (await memory?.getHistory(userId)) || [];

    const messages = [{ role: "system", content: system }];
    const memoryCtx = await MemoryService.getMemoryContext(userId);
    if (memoryCtx) {
      messages.push({ role: "system", content: `Facts the bot remembers about this user (use them naturally, never list them):\n${memoryCtx}` });
    }
    for (const msg of history.slice(-10)) {
      messages.push({ role: "user", content: msg.user });
      if (msg.assistant) messages.push({ role: "assistant", content: msg.assistant });
    }
    messages.push({ role: "user", content: prompt });
    return messages;
  }
}

export default PromptBuilder;
