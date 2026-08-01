import { describe, expect, it } from "vitest";
import { CONFIRMATION_MODE, fallbackPhrase, isRegurgitation, normalizeConfirmation } from "./confirmationPrompts.js";

describe("isRegurgitation", () => {
  it("detects real instruction-echo leak (pause)", () => {
    const leak =
      'The user wants me to respond as Paperplane, a friendly Discord music bot. The context says the music was paused ("Kartonyono Medot Janji"...';
    expect(isRegurgitation(leak)).toBe(true);
  });

  it("detects real instruction-echo leak (resume)", () => {
    const leak =
      'The user wants me to reply as Paperplane confirming that music has been resumed. The context says the last message is a status summary "R...';
    expect(isRegurgitation(leak)).toBe(true);
  });

  it("detects third-person narration variants", () => {
    expect(isRegurgitation("The system says the action completed.")).toBe(true);
    expect(isRegurgitation("The context indicates playback was paused.")).toBe(true);
    expect(isRegurgitation("I'm here to confirm that the music has been paused.")).toBe(true);
    expect(isRegurgitation("As an AI, I need to confirm the action.")).toBe(true);
    expect(isRegurgitation("Your reply should confirm the pause.")).toBe(true);
    expect(isRegurgitation("Based on the context, the music was paused.")).toBe(true);
  });

  it("passes natural confirmations", () => {
    expect(isRegurgitation("Lanjut! 🔊")).toBe(false);
    expect(isRegurgitation("Sip, di-pause ya ⏸️")).toBe(false);
    expect(isRegurgitation("Udah, beres! 👋")).toBe(false);
    expect(isRegurgitation("Oke, autoplay dimatikan.")).toBe(false);
  });

  it("rejects empty output", () => {
    expect(isRegurgitation("")).toBe(true);
    expect(isRegurgitation("   ")).toBe(true);
  });
});

describe("CONFIRMATION_MODE", () => {
  it("no longer contains regurgitatable narrative instructions", () => {
    expect(CONFIRMATION_MODE).not.toMatch(/status summary/i);
    expect(CONFIRMATION_MODE).not.toMatch(/do not quote/i);
    expect(CONFIRMATION_MODE).not.toMatch(/never narrate/i);
  });
});

describe("normalizeConfirmation", () => {
  it("keeps first line and truncates long output", () => {
    expect(normalizeConfirmation("Sip, di-pause ya ⏸️\nignored")).toBe("Sip, di-pause ya ⏸️");
    expect(normalizeConfirmation("x".repeat(200))).toBe("x".repeat(137) + "...");
  });
});

describe("fallbackPhrase", () => {
  it("fills template vars and falls back to Done", () => {
    expect(fallbackPhrase("volume", { vol: 42 })).toMatch(/42/);
    expect(fallbackPhrase("does-not-exist")).toBe("Done!");
  });
});
