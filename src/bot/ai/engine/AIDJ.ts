import AIEngine from "../engine/AIEngine";
import CommandInterpreter from "./CommandInterpreter";

class AIDJ {
  private interpreter: CommandInterpreter;

  constructor() {
    this.interpreter = new CommandInterpreter();
  }

  async interpret(input: any) {
    const result = await this.interpreter.interpret(input);
    if (result.type !== "chat") return result;

    const systemPrompt =
      "You are a Discord music bot. You understand ALL languages.\n" +
      "If the user wants music control, reply with EXACTLY ONE of these formats (single line, no extra text):\n" +
      "PLAY: <song name>\n" +
      "PLAYLIST: <song1> by <artist1>, <song2> by <artist2>, ...\n" +
      "CORRECT: <corrected keyword>\n" +
      "SKIP\nSTOP\nPAUSE\nRESUME\nQUEUE\n" +
      "If just chatting, reply as a helpful assistant.\n" +
      "CRITICAL: For PLAY/PLAYLIST, use the exact song name as-is.\n" +
      'Examples:\n' +
      'User: mainkan lagu nina\nYou: PLAY: lagu nina\n' +
      'User: stop\nYou: STOP';

    AIEngine.clearMemory("aidj");
    const reply = await AIEngine.ask("aidj", input, systemPrompt);
    const firstLine = reply.split("\n")[0].trim();

    const playlistMatch = firstLine.match(/^PLAYLIST:\s*(.+)/i);
    if (playlistMatch) {
      const songs = playlistMatch[1].split(",").map((s: any) => s.trim()).filter(Boolean);
      return { type: "playlist", songs };
    }

    const playMatch = firstLine.match(/^PLAY:\s*(.+)/i);
    if (playMatch) return { type: "play", query: playMatch[1].trim() };

    const correctMatch = firstLine.match(/^CORRECT:\s*(.+)/i);
    if (correctMatch) return { type: "correct_playlist", keyword: correctMatch[1].trim() };

    if (/^SKIP/i.test(firstLine)) return { type: "skip" };
    if (/^STOP/i.test(firstLine)) return { type: "stop" };
    if (/^PAUSE/i.test(firstLine)) return { type: "pause" };
    if (/^RESUME/i.test(firstLine)) return { type: "resume" };
    if (/^QUEUE/i.test(firstLine)) return { type: "queue" };

    return { type: "chat", reply };
  }
}

export default AIDJ;
