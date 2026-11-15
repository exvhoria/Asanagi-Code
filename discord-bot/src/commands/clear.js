import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Bulk-delete recent messages in this channel")
    .addIntegerOption(
      /**
       * Configures the required `amount` integer option.
       *
       * @param {import("discord.js").SlashCommandIntegerOption} o - The integer option being configured.
       * @returns {import("discord.js").SlashCommandIntegerOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /clear command.
       */
      (o) =>
        o
          .setName("amount")
          .setDescription("How many messages to delete (1-100)")
          .setMinValue(1)
          .setMaxValue(100)
          .setRequired(true)
    )
    .addUserOption(
      /**
       * Configures the optional `user` user option.
       *
       * @param {import("discord.js").SlashCommandUserOption} o - The user option being configured.
       * @returns {import("discord.js").SlashCommandUserOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /clear command.
       */
      (o) => o.setName("user").setDescription("Only delete messages from this user")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),
  /**
   * Handle the `/clear` slash command: bulk-deletes recent messages in the
   * current channel, optionally limited to messages from a specific user.
   * Skipped messages are counted and reported.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the messages are deleted and the summary reply is edited in.
   * @throws {import("discord.js").DiscordAPIError} If the fetch, bulk delete, or reply calls fail.
   * @example
   * // Triggered when a user runs /clear in Discord.
   */
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: "❌ You need the **Manage Messages** permission to use this.",
        ephemeral: true,
      });
    }

    const amount = interaction.options.getInteger("amount", true);
    const user = interaction.options.getUser("user");

    if (!interaction.channel?.isTextBased()) {
      return interaction.reply({
        content: "I can't delete messages in this channel.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const fetched = await interaction.channel.messages.fetch({ limit: 100 });
    const targets = user
      ? fetched
          .filter(
            /**
             * Checks whether a fetched message was authored by the target user.
             *
             * @param {import("discord.js").Message<true>} m - The fetched message being tested.
             * @returns {boolean} True if the message was authored by the target user.
             * @throws {never} Pure ID comparison.
             * @example
             * // Used by /clear when the optional user filter is supplied.
             */
            (m) => m.author.id === user.id
          )
          .first(amount)
      : fetched.first(amount);

    if (targets.length === 0) {
      return interaction.editReply(
        user ? `No recent messages from **${user.tag}** were found to delete.` : "No messages found to delete."
      );
    }

    const deleted = await interaction.channel.bulkDelete(targets, true);

    const skipped = targets.length - deleted.size;
    await interaction.editReply(
      `🧹 Deleted **${deleted.size}** message(s)${user ? ` from **${user.tag}**` : ""}.` +
        (skipped > 0 ? ` ${skipped} were skipped (older than 14 days or outside the recent 100).` : "")
    );
  },
};
