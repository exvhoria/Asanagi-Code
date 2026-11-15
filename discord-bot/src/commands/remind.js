import { SlashCommandBuilder } from "discord.js";
import { MAX_DURATION_MS, formatMs, parseDuration } from "../lib/duration.js";

export default {
  data: new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Set a reminder for yourself")
    .addStringOption(
      /**
       * Configures the required `duration` string option.
       *
       * @param {import("discord.js").SlashCommandStringOption} o - The duration option being configured.
       * @returns {import("discord.js").SlashCommandStringOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /remind command.
       */
      (o) =>
        o
          .setName("duration")
          .setDescription("When to remind you, e.g. 30s, 10m, 2h, 1d (default unit: minutes)")
          .setRequired(true)
    )
    .addStringOption(
      /**
       * Configures the required `text` string option.
       *
       * @param {import("discord.js").SlashCommandStringOption} o - The reminder text option being configured.
       * @returns {import("discord.js").SlashCommandStringOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /remind command.
       */
      (o) =>
        o
          .setName("text")
          .setDescription("What to remind you about")
          .setMaxLength(1000)
          .setRequired(true)
    ),
  /**
   * Parses the duration string, validates it, confirms the reminder to the user,
   * and schedules a channel message to be delivered after the delay.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the confirmation reply has been sent and the reminder scheduled.
   * @throws {import("discord.js").DiscordAPIError} If replying to the interaction fails.
   * @example
   * // Triggered when a user runs /remind duration:10m text:"stretch" in Discord.
   */
  async execute(interaction) {
    const input = interaction.options.getString("duration", true);
    const text = interaction.options.getString("text", true);
    const ms = parseDuration(input);

    if (!ms) {
      return interaction.reply({
        content:
          "⚠️ Invalid duration. Use a number with an optional unit: `30s`, `10m`, `2h`, `1d`, `1w`.",
        ephemeral: true,
      });
    }
    if (ms > MAX_DURATION_MS) {
      return interaction.reply({
        content: "⚠️ Reminders can be at most **7 days** in the future.",
        ephemeral: true,
      });
    }

    const dueAt = Math.floor((Date.now() + ms) / 1000);
    await interaction.reply({
      content: `⏰ Got it — I'll remind you **${formatMs(ms)}** from now (<t:${dueAt}:R>).`,
      ephemeral: true,
    });

    /**
     * Delivers the reminder message to the channel once the delay elapses.
     * The timer is unref'd so a pending reminder never keeps the process alive
     * past shutdown (the reminder is lost on restart either way).
     *
     * @returns {Promise<void>} Resolves once the reminder has been sent or its failure logged.
     * @throws {never} Send failures are caught and logged.
     * @example
     * // Runs after the requested duration, e.g. 10 minutes later.
     */
    setTimeout(async () => {
      if (!interaction.channel) {
        console.warn("[remind] Channel unavailable; reminder dropped:", text);
        return;
      }
      try {
        await interaction.channel?.send({
          content: `<@${interaction.user.id}> ⏰ Reminder: ${text}`,
          allowedMentions: { parse: ["users"] },
        });
      } catch (error) {
        console.error("[remind] Failed to deliver reminder:", error);
      }
    }, ms).unref?.();
  },
};
