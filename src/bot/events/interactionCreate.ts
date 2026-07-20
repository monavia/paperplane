import Logger from "../core/utils/Logger";
import { isLavalinkReady } from "../music/services/MusicService";
import * as ErrorEmbed from "../ui/embeds/ErrorEmbed";

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

    try {
      await cmd.execute(interaction);
    } catch (err: any) {
      Logger.error(`Command ${interaction.commandName} error: ${err.message}`);
      const reply = { content: "An error occurred while executing this command.", ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
  });
}
