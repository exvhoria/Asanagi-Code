import { SlashCommandBuilder } from "discord.js";
import { MAX_DICE, MAX_SIDES, formatRollReply, rollDice } from "../lib/dice.js";

export default {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll dice")
    .addIntegerOption(
      /**
       * Configures the optional `sides` integer option.
       *
       * @param {import("discord.js").SlashCommandIntegerOption} o - The integer option being configured.
       * @returns {import("discord.js").SlashCommandIntegerOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /roll command.
       */
      (o) =>
        o
          .setName("sides")
          .setDescription("Number of sides per die (default 6)")
          .setMinValue(2)
          .setMaxValue(MAX_SIDES)
    )
    .addIntegerOption(
      /**
       * Configures the optional `dice` integer option.
       *
       * @param {import("discord.js").SlashCommandIntegerOption} o - The integer option being configured.
       * @returns {import("discord.js").SlashCommandIntegerOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /roll command.
       */
      (o) =>
        o
          .setName("dice")
          .setDescription("How many dice to roll (default 1)")
          .setMinValue(1)
          .setMaxValue(MAX_DICE)
    ),
  /**
   * Handle the `/roll` slash command: rolls the requested number of dice with
   * the requested number of sides and replies with the individual rolls and total.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the roll result reply is sent.
   * @throws {import("discord.js").DiscordAPIError} If the reply fails.
   * @example
   * // Triggered when a user runs /roll in Discord.
   */
  async execute(interaction) {
    const sides = interaction.options.getInteger("sides") ?? 6;
    const dice = interaction.options.getInteger("dice") ?? 1;
    const { rolls, total } = rollDice(dice, sides);

    await interaction.reply(formatRollReply(dice, sides, rolls, total));
  },
};
