export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

const DISCORD_FRIENDLY: Record<string, string> = {
  "429": "Discord rate-limited us — please try again in a minute.",
  "403": "I don't have permission to do that here.",
  "50013": "I don't have permission to do that here.",
  "50007": "I can't message this user — DMs may be blocked.",
  "10008": "That message no longer exists.",
};

export interface Classification {
  kind: "user" | "discord" | "system";
  message: string;
}

export function classifyError(err: any): Classification {
  if (err instanceof UserError) {
    return { kind: "user", message: err.message };
  }
  const code = String(err?.code ?? "");
  const status = Number(err?.status) || 0;
  if (err?.name === "DiscordAPIError" || status >= 400) {
    const friendly = DISCORD_FRIENDLY[code] || DISCORD_FRIENDLY[String(status)];
    if (friendly) return { kind: "discord", message: friendly };
    return { kind: "discord", message: "Discord API error — please try again." };
  }
  return { kind: "system", message: "Something went wrong on my side. Please try again in a few minutes." };
}
