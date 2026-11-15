import { SlashCommandBuilder } from "discord.js";
import {
  MAX_DICE,
  MAX_SIDES,
  formatRollReply,
  isNotationInRange,
  parseNotation,
  rollDice,
} from "../lib/dice.js";

export default {
  data: new SlashCommandBuilder()
    .setName("dice")
    .setDescription("Roll dice in NdN notation, e.g. 2d6 or 4d20")
    .addStringOption(
      /**
       * Configures the required `notation` string option.
       *
       * @param {import("discord.js").SlashCommandStringOption} o - The notation option being configured.
       * @returns {import("discord.js").SlashCommandStringOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /dice command.
       */
      (o) =>
        o
          .setName("notation")
          .setDescription(`NdN — N dice with N sides (max ${MAX_DICE}d${MAX_SIDES})`)
          .setMaxLength(20)
          .setRequired(true)
    ),
  /**
   * Parses the NdN dice notation, validates it, rolls the dice, and replies
   * with the individual rolls and total.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the roll result or an error message has been sent.
   * @throws {import("discord.js").DiscordAPIError} If replying to the interaction fails.
   * @example
   * // Triggered when a user runs /dice with notation "2d6" in Discord.
   */
  async execute(interaction) {
    const input = interaction.options.getString("notation", true);
    const parsed = parseNotation(input);

    if (!parsed) {
      return interaction.reply({
        content: "⚠️ Invalid notation. Use the form **NdN**, e.g. `2d6` or `4d20`.",
        ephemeral: true,
      });
    }
    if (!isNotationInRange(parsed)) {
      return interaction.reply({
        content: `⚠️ Out of range: use between **1 and ${MAX_DICE}** dice with **2 to ${MAX_SIDES}** sides.`,
        ephemeral: true,
      });
    }

    const { dice, sides } = parsed;
    const { rolls, total } = rollDice(dice, sides);

    await interaction.reply(formatRollReply(dice, sides, rolls, total));
  },
};
