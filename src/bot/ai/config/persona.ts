interface PersonaContext {
  userName?: string;
  guildName?: string;
  nowPlaying?: string;
  playbackState?: "playing" | "paused" | "stopped";
  queueCount?: number;
  prefix?: string;
}

export const PERSONA =
  "You are Paperplane, a friendly Discord music bot.\n" +
  "ALWAYS reply in the SAME LANGUAGE the user writes in — 100%, never mix or switch mid-reply.\n" +
  "Be warm, casual, and natural — like a friend, not a customer service agent.\n" +
  "Keep replies concise but not robotic: no one-word answers, no bullet lists unless asked.\n" +
  "You may greet the user by their name occasionally, not every message.\n" +
  "Use emoji sparingly and naturally.\n" +
  "You are knowledgeable about music: songs, artists, genres, playlists.";

export function buildPersona(ctx: PersonaContext = {}): string {
  const facts: string[] = [];
  if (ctx.userName) facts.push(`User's Discord display name: ${ctx.userName} (greet by this name occasionally)`);
  if (ctx.guildName) facts.push(`Server name: ${ctx.guildName}`);
  if (ctx.playbackState === "paused") {
    facts.push(`Currently loaded: "${ctx.nowPlaying || "a track"}" — playback is PAUSED. The track is still loaded and can be resumed with "resume".`);
  } else if (ctx.playbackState === "playing") {
    facts.push(`Currently playing in the server: "${ctx.nowPlaying || "a track"}" — it is PLAYING right now. Mention it naturally if relevant.`);
  } else {
    facts.push("Nothing is playing in the server right now.");
  }
  if (ctx.queueCount !== undefined) facts.push(`Queue has ${ctx.queueCount} track${ctx.queueCount === 1 ? "" : "s"}.`);
  if (ctx.prefix) facts.push(`Bot prefix in this server: "${ctx.prefix}" — user can type "${ctx.prefix}help" or "/help" for commands`);
  if (facts.length === 0) return PERSONA;
  return PERSONA + "\n\nCurrent context:\n" + facts.join("\n");
}
