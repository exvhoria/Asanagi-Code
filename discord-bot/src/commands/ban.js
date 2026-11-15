import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user from the server")
    .addUserOption(
      /**
       * Configures the required `target` user option.
       *
       * @param {import("discord.js").SlashCommandUserOption} o - The user option being configured.
       * @returns {import("discord.js").SlashCommandUserOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /ban command.
       */
      (o) => o.setName("target").setDescription("The user to ban").setRequired(true)
    )
    .addStringOption(
      /**
       * Configures the optional `reason` string option.
       *
       * @param {import("discord.js").SlashCommandStringOption} o - The string option being configured.
       * @returns {import("discord.js").SlashCommandStringOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /ban command.
       */
      (o) => o.setName("reason").setDescription("Reason for the ban")
    )
    .addIntegerOption(
      /**
       * Configures the optional `delete_messages` integer option.
       *
       * @param {import("discord.js").SlashCommandIntegerOption} o - The integer option being configured.
       * @returns {import("discord.js").SlashCommandIntegerOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /ban command.
       */
      (o) =>
        o
          .setName("delete_messages")
          .setDescription("Also delete their recent messages (days)")
          .setMinValue(0)
          .setMaxValue(7)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),
  /**
   * Handle the `/ban` slash command: validates the invoker's permissions and the
   * target user, then bans them from the guild with an optional reason and
   * optional deletion of recent messages.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the ban and the confirmation reply complete.
   * @throws {import("discord.js").DiscordAPIError} If the ban API call or the reply fails.
   * @example
   * // Triggered when a user runs /ban in Discord.
   */
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({
        content: "❌ You need the **Ban Members** permission to use this.",
        ephemeral: true,
      });
    }

    const user = interaction.options.getUser("target", true);
    const member = interaction.options.getMember("target");
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const deleteDays = interaction.options.getInteger("delete_messages") ?? 0;

    if (user.id === interaction.user.id) {
      return interaction.reply({ content: "You can't ban yourself.", ephemeral: true });
    }
    if (member && !member.bannable) {
      return interaction.reply({
        content: "I can't ban that member — their role is above mine or I lack permissions.",
        ephemeral: true,
      });
    }

    await interaction.guild.members.ban(user, {
      reason,
      deleteMessageSeconds: deleteDays * 24 * 60 * 60,
    });
    await interaction.reply({
      content: `🔨 Banned **${user.tag}**${deleteDays ? ` and deleted ${deleteDays} day(s) of messages` : ""} — reason: ${reason}`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  },
};
