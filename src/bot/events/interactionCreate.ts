import Logger from "../core/utils/Logger";

export function start(client: any): void {
  client.on("interactionCreate", async (interaction: any) => {
    if (!interaction.isChatInputCommand()) return;

    const cmd = client.slashCommands?.get(interaction.commandName);
    if (!cmd) return;

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
