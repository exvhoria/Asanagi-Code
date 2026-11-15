import { SlashCommandBuilder } from "discord.js";

/**
 * Number emojis used to label poll options, index-aligned with the option list
 * (supports up to 10 options).
 *
 * @type {string[]}
 * @example
 * NUMBER_EMOJIS[0]; // "1️⃣"
 */
const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

/**
 * Logs a failed reaction (e.g. the bot lacks "Add Reactions") without throwing,
 * so one broken emoji does not fail the whole poll after it was already posted.
 *
 * @param {unknown} error - The reaction failure reason.
 * @returns {void}
 * @throws {never} Only writes to stderr.
 * @example
 * message.react("👍").catch(logReactionError);
 */
function logReactionError(error) {
  console.error("[poll] Failed to add reaction:", error);
}

export default {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a reaction poll")
    .addStringOption(
      /**
       * Configures the required `question` string option.
       *
       * @param {import("discord.js").SlashCommandStringOption} o - The string option being configured.
       * @returns {import("discord.js").SlashCommandStringOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /poll command.
       */
      (o) =>
        o
          .setName("question")
          .setDescription("The poll question")
          .setMaxLength(500)
          .setRequired(true)
    )
    .addStringOption(
      /**
       * Configures the optional comma-separated `options` string option.
       *
       * @param {import("discord.js").SlashCommandStringOption} o - The string option being configured.
       * @returns {import("discord.js").SlashCommandStringOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /poll command.
       */
      (o) =>
        o
          .setName("options")
          .setDescription("Comma-separated options (2-10). Leave empty for a 👍/👎 vote.")
          .setMaxLength(500)
    ),
  /**
   * Handle the `/poll` slash command: parses comma-separated options, then posts
   * the poll as a message. With no options it reacts with 👍/👎; otherwise each
   * option gets a numbered emoji reaction.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the poll message is posted and reactions are added.
   * @throws {import("discord.js").DiscordAPIError} If the reply, fetch, or reaction calls fail.
   * @example
   * // Triggered when a user runs /poll in Discord.
   */
  async execute(interaction) {
    const question = interaction.options.getString("question", true);
    const raw = interaction.options.getString("options");
    const options = raw
      ? raw
          .split(",")
          .map(
            /**
             * Trims whitespace from one raw option entry.
             *
             * @param {string} s - A raw, possibly padded option entry.
             * @returns {string} The trimmed option entry.
             * @throws {never} String trim only.
             * @example
             * "  Yes  ".trim(); // "Yes"
             */
            (s) => s.trim()
          )
          .filter(
            /**
             * Drops empty option entries produced by stray commas.
             *
             * @param {string} s - A trimmed option entry.
             * @returns {boolean} True when the entry is non-empty.
             * @throws {never} Truthiness check only.
             * @example
             * Boolean("Yes"); // true
             */
            Boolean
          )
      : [];

    if (options.length === 1) {
      return interaction.reply({
        content:
          "Please provide at least **two** options (separated by commas), or none at all for a 👍/👎 poll.",
        ephemeral: true,
      });
    }
    if (options.length > NUMBER_EMOJIS.length) {
      return interaction.reply({
        content: `Maximum **${NUMBER_EMOJIS.length}** options allowed.`,
        ephemeral: true,
      });
    }

    if (options.length === 0) {
      await interaction.reply({
        content: `📊 **${question}**`,
        allowedMentions: { parse: [] },
      });
      const message = await interaction.fetchReply();
      await message.react("👍").catch(logReactionError);
      await message.react("👎").catch(logReactionError);
      return;
    }

    const body = options
      .map(
        /**
         * Formats one poll option with its numbered emoji prefix.
         *
         * @param {string} opt - The option text.
         * @param {number} i - The option index, used to pick its number emoji.
         * @returns {string} A formatted poll line with the number emoji prefix.
         * @throws {never} String interpolation only.
         * @example
         * // Produces lines such as "1️⃣ Yes".
         */
        (opt, i) => `${NUMBER_EMOJIS[i]} ${opt}`
      )
      .join("\n");
    await interaction.reply({
      content: `📊 **${question}**\n\n${body}`,
      allowedMentions: { parse: [] },
    });
    const message = await interaction.fetchReply();
    for (const emoji of NUMBER_EMOJIS.slice(0, options.length)) {
      await message.react(emoji).catch(logReactionError);
    }
  },
};
