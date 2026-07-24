import AIEngine from "./AIEngine.js";

class AIRecommendationEngine {
  async recommendMusic(taste: any, count = 5) {
    const prompt = `Recommend ${count} songs based on this taste: "${taste}". Return only a numbered list with artist and track name.`;
    return AIEngine.ask("recommendation-system", prompt, "");
  }

  async summarizeText(text: any) {
    const prompt = `Summarize the following text concisely:\n\n${text}`;
    return AIEngine.ask("summarize-system", prompt, "");
  }

  async generateImagePrompt(idea: any) {
    const prompt = `Create a detailed image generation prompt for: "${idea}"`;
    return AIEngine.ask("imagine-system", prompt, "");
  }
}

export default new AIRecommendationEngine();
