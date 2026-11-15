import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { COLORS } from "../colors.js";

/** Base URL of the dictionaryapi.dev v2 English endpoint. */
const API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en";
/** Timeout applied to the dictionary fetch, in milliseconds. */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Truncates a string to Discord's embed limits, appending an ellipsis when cut.
 *
 * @param {unknown} value - The value to clamp.
 * @param {number} max - Maximum allowed length.
 * @returns {string} The original string when short enough, otherwise a clamped copy.
 * @throws {never} Pure string manipulation.
 * @example
 * truncate("hello", 4); // "hel…"
 */
function truncate(value, max) {
  const text = typeof value === "string" ? value : "";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export default {
  data: new SlashCommandBuilder()
    .setName("define")
    .setDescription("Look up a word in the dictionary")
    .addStringOption(
      /**
       * Configures the required `word` string option.
       *
       * @param {import("discord.js").SlashCommandStringOption} o - The word option being configured.
       * @returns {import("discord.js").SlashCommandStringOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /define command.
       */
      (o) =>
        o
          .setName("word")
          .setDescription("The word to define")
          .setRequired(true)
          .setMaxLength(100)
    ),
  /**
   * Looks up the requested word via the dictionaryapi.dev service and replies
   * with an embed showing the phonetic spelling and up to three meanings.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the definition embed or an error message has been sent.
   * @throws {import("discord.js").DiscordAPIError} If deferring or editing the reply fails.
   * @example
   * // Triggered when a user runs /define word:serendipity in Discord.
   */
  async execute(interaction) {
    const word = interaction.options.getString("word", true).trim();

    await interaction.deferReply();

    let entries;
    try {
      const response = await fetch(`${API_BASE}/${encodeURIComponent(word)}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.status === 404) {
        return interaction.editReply({
          content: `📖 No dictionary entry found for **${word}**.`,
          allowedMentions: { parse: [] },
        });
      }
      if (!response.ok) {
        throw new Error(`dictionaryapi.dev returned ${response.status}`);
      }
      entries = await response.json();
    } catch (error) {
      console.error("[define] Lookup failed:", error);
      return interaction.editReply(
        "⚠️ Couldn't reach the dictionary service. Please try again later."
      );
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return interaction.editReply({
        content: `📖 No dictionary entry found for **${word}**.`,
        allowedMentions: { parse: [] },
      });
    }

    const entry = entries[0];
    if (!entry || typeof entry !== "object" || typeof entry.word !== "string" || !entry.word.trim()) {
      return interaction.editReply({
        content: `📖 No definitions available for **${word}**.`,
        allowedMentions: { parse: [] },
      });
    }

    const phonetic =
      (typeof entry.phonetic === "string" && entry.phonetic) ||
      (Array.isArray(entry.phonetics)
        ? entry.phonetics.find(
            /**
             * Finds the first phonetic entry that has non-empty string text.
             *
             * @param {{ text?: string }} p - A phonetic transcription entry.
             * @returns {boolean} Whether the entry has non-empty string text.
             * @throws {never} Pure type check.
             * @example
             * // Used to pick a display phonetic from the API response.
             */
            (p) => typeof p?.text === "string" && p.text.trim().length > 0
          )?.text
        : null) ||
      null;
    const meanings = Array.isArray(entry.meanings) ? entry.meanings.slice(0, 3) : [];

    if (meanings.length === 0) {
      return interaction.editReply({
        content: `📖 No definitions available for **${word}**.`,
        allowedMentions: { parse: [] },
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(truncate(`📖 ${entry.word}`, 256))
      .setColor(COLORS.brand);

    if (phonetic) embed.setDescription(truncate(phonetic, 4096));

    for (const meaning of meanings) {
      if (!meaning || typeof meaning !== "object") continue;
      const definitions = Array.isArray(meaning.definitions)
        ? meaning.definitions
            .filter(
              /**
               * Keeps only definitions that actually contain text.
               *
               * @param {{ definition?: string }} d - A single definition entry.
               * @returns {boolean} True when the definition is a non-empty string.
               * @throws {never} Pure type check.
               * @example
               * // Filters malformed entries out of the API response.
               */
              (d) => typeof d?.definition === "string" && d.definition.trim().length > 0
            )
            .slice(0, 2)
            .map(
              /**
               * Formats one definition as a numbered line.
               *
               * @param {{ definition: string }} d - A single definition entry.
               * @param {number} i - The zero-based index of the definition.
               * @returns {string} A numbered definition line.
               * @throws {never} String interpolation only.
               * @example
               * // Produces lines such as "1. A happy accident."
               */
              (d, i) => `${i + 1}. ${d.definition}`
            )
            .join("\n")
        : "";
      if (definitions) {
        const partOfSpeech =
          typeof meaning.partOfSpeech === "string" && meaning.partOfSpeech.trim()
            ? meaning.partOfSpeech
            : "Definition";
        embed.addFields({
          name: truncate(partOfSpeech, 256),
          value: truncate(definitions, 1024),
        });
      }
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
