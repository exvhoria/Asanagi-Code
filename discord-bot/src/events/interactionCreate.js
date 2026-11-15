import { Events } from "discord.js";
import { config } from "../config.js";
import { checkCooldown } from "../cooldowns.js";

/**
 * Swallows a failed interaction reply so the interaction handler never throws.
 *
 * @returns {void}
 * @throws {never} Never throws.
 * @example
 * interaction.reply(payload).catch(ignoreReplyError);
 */
function ignoreReplyError() {}

export default {
  name: Events.InteractionCreate,
  /**
   * Handles chat input command interactions: resolves the registered
   * command, applies a per-user cooldown, and runs it with error handling
   * that reports failures to the user ephemerally. Non-command
   * interactions are ignored.
   *
   * @param {import("discord.js").Interaction} interaction - The interaction received from Discord.
   * @returns {Promise<void>}
   * @throws {never} Never throws; command errors and reply failures are caught, logged, and reported to the user.
   * @example
   * // Wired up automatically in src/index.js as an Events.InteractionCreate handler.
   */
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      console.warn(`[interaction] No handler for /${interaction.commandName}`);
      await interaction
        .reply({ content: "⚠️ That command isn't registered. Run `npm run deploy` to refresh.", ephemeral: true })
        .catch(ignoreReplyError);
      return;
    }

    const seconds =
      typeof command.cooldown === "number" ? command.cooldown : config.commandCooldownSeconds;
    const remaining = checkCooldown(interaction.user.id, command.data.name, seconds);
    if (remaining > 0) {
      await interaction
        .reply({
          content: `⏳ \`/${command.data.name}\` is on cooldown — try again in **${remaining}s**.`,
          ephemeral: true,
        })
        .catch(ignoreReplyError);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[interaction] Error in /${interaction.commandName}:`, error);
      const payload = {
        content: "⚠️ Something went wrong while running that command. Please try again later.",
        ephemeral: true,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(ignoreReplyError);
      } else {
        await interaction.reply(payload).catch(ignoreReplyError);
      }
    }
  },
};
