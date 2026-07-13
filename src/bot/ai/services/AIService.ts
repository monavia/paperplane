import AIEngine from "../engine/AIEngine";
import AIRecommendationEngine from "../engine/RecommendationEngine";

async function ask(userId: string, prompt: string) {
  return AIEngine.ask(userId, prompt, undefined);
}

async function recommend(taste: string) {
  return AIRecommendationEngine.recommendMusic(taste);
}

const AIService = { ask, recommend };
export default AIService;
