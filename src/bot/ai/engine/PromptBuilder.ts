class PromptBuilder {
  static async build(userId: any, prompt: any, systemOverride: any, memory: any) {
    const system = systemOverride || "You are Paperplane, a Discord music bot with AI assistant. Answer concisely.";
    const history = (await memory?.getHistory(userId)) || [];

    const messages = [{ role: "system", content: system }];
    for (const msg of history.slice(-10)) {
      messages.push({ role: "user", content: msg.user });
      if (msg.assistant) messages.push({ role: "assistant", content: msg.assistant });
    }
    messages.push({ role: "user", content: prompt });
    return messages;
  }
}

export default PromptBuilder;
