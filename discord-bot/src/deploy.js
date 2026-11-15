import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import { loadCommands } from "./loadCommands.js";

/**
 * Converts a loaded command module into the JSON payload expected by the
 * Discord application-command API.
 *
 * @param {{ data: { name: string, toJSON: () => object }, execute: (interaction: import("discord.js").Interaction) => Promise<void> }} command - A loaded command module.
 * @returns {object} The command's JSON payload for the Discord API.
 * @throws {TypeError} If the command does not expose a `data.toJSON` function.
 * @example
 * // Applied to every loaded command before registration:
 * const commands = [...(await loadCommands()).values()].map(toPayload);
 */
function toPayload(command) {
  return command.data.toJSON();
}

const commands = [...(await loadCommands()).values()].map(toPayload);

const rest = new REST().setToken(config.token);

try {
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  const data = await rest.put(route, { body: commands });
  console.log(
    `[deploy] Registered ${data.length} slash command(s) ${config.guildId ? `in guild ${config.guildId}` : "globally"}.`
  );
} catch (error) {
  console.error("[deploy] Failed to register commands:", error);
  process.exit(1);
}
