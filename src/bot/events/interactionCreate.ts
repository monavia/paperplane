import Logger from "../core/utils/Logger.js";
import { isLavalinkReady } from "../music/services/MusicService.js";
import * as ErrorEmbed from "../ui/embeds/ErrorEmbed.js";
import CooldownManager from "../core/utils/CooldownManager.js";
import { incCommandsExecuted, observeCommandLatency } from "../telemetry/MetricsCollector.js";
import { classifyError } from "../core/errors/ErrorClassifier.js";

export function start(client: any): void {
  client.on("interactionCreate", async (interaction: any) => {
    if (!interaction.isChatInputCommand()) return;

    const cmd = client.slashCommands?.get(interaction.commandName);
    if (!cmd) return;

    // Graceful degradation: block music commands when Lavalink is down
    const musicCommands = ["play", "skip", "stop", "pause", "resume", "queue", "nowplaying", "volume", "search", "autoplay", "loop", "shuffle", "clear", "remove", "move", "swap", "jump", "seek", "filter", "equalizer", "lyrics", "nowplaying", "volume"];
if (musicCommands.includes(interaction.commandName) && !isLavalinkReady()) {
        return interaction.reply({ embeds: [ErrorEmbed.build("Music service is currently unavailable. Please try again in a few minutes.")], ephemeral: true });
      }

    // Cooldown
    const cdMs = musicCommands.includes(interaction.commandName) ? 5000 : 3000;
    if (!CooldownManager.check(interaction.user.id, interaction.commandName, cdMs)) {
      const remain = CooldownManager.getRemaining(interaction.user.id, interaction.commandName, cdMs);
      return interaction.reply({ content: `Please wait ${Math.ceil(remain / 1000)}s before using this command again.`, ephemeral: true });
    }
    CooldownManager.set(interaction.user.id, interaction.commandName);

    const start = Date.now();
    try {
      await cmd.execute(interaction);
      incCommandsExecuted({ command: interaction.commandName, status: "success" });
      observeCommandLatency(interaction.commandName, Date.now() - start);
    } catch (err: any) {
      incCommandsExecuted({ command: interaction.commandName, status: "failure" });
      const cls = classifyError(err);
      if (cls.kind === "user") {
        Logger.warn(`Command ${interaction.commandName} user error: ${err.message}`);
      } else {
        Logger.error(`Command ${interaction.commandName} error: ${err.message}`);
        import("@sentry/node").then((S) => S.captureException(err, { tags: { command: interaction.commandName } })).catch(() => {});
      }
      const reply = { content: cls.message, ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(reply).catch((e: any) =>
          Logger.warn(`[interactionCreate] Failed to editReply for /${interaction.commandName}: ${e?.message || e}`)
        );
      } else {
        await interaction.reply(reply).catch((e: any) =>
          Logger.warn(`[interactionCreate] Failed to reply for /${interaction.commandName}: ${e?.message || e}`)
        );
      }
    }
  });
}
