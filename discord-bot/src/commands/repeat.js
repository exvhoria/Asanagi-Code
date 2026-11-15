import { SlashCommandBuilder } from "discord.js";
import { MAX_REPEAT_LENGTH, MAX_REPEAT_TIMES, buildRepeat } from "../lib/stats.js";

export default {
  data: new SlashCommandBuilder()
    .setName("repeat")
    .setDescription("Repeat a text N times")
    .addStringOption(
      /**
       * Configures the required `text` string option.
       *
       * @param {import("discord.js").SlashCommandStringOption} o - The text option being configured.
       * @returns {import("discord.js").SlashCommandStringOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /repeat command.
       */
      (o) =>
        o
          .setName("text")
          .setDescription(`Text to repeat (max ${MAX_REPEAT_LENGTH} characters)`)
          .setRequired(true)
          .setMaxLength(MAX_REPEAT_LENGTH)
    )
    .addIntegerOption(
      /**
       * Configures the optional `times` integer option.
       *
       * @param {import("discord.js").SlashCommandIntegerOption} o - The repeat-count option being configured.
       * @returns {import("discord.js").SlashCommandIntegerOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /repeat command.
       */
      (o) =>
        o
          .setName("times")
          .setDescription(`How many times to repeat it (1–${MAX_REPEAT_TIMES}, default 1)`)
          .setMinValue(1)
          .setMaxValue(MAX_REPEAT_TIMES)
    ),
  /**
   * Builds the repeated text and replies with it, or reports the validation
   * error returned by the builder.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the repeated text or an error message has been sent.
   * @throws {import("discord.js").DiscordAPIError} If replying to the interaction fails.
   * @example
   * // Triggered when a user runs /repeat text:"hi" times:3 in Discord.
   */
  async execute(interaction) {
    const text = interaction.options.getString("text", true);
    const times = interaction.options.getInteger("times") ?? 1;
    const result = buildRepeat(text, times);

    if (!result.ok) {
      return interaction.reply({ content: `⚠️ ${result.error}`, ephemeral: true });
    }

    await interaction.reply({ content: result.output, allowedMentions: { parse: [] } });
  },
};
