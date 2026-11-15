import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Put a member in timeout")
    .addUserOption(
      /**
       * Configures the required `target` user option.
       *
       * @param {import("discord.js").SlashCommandUserOption} o - The target member option being configured.
       * @returns {import("discord.js").SlashCommandUserOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /timeout command.
       */
      (o) => o.setName("target").setDescription("The member to timeout").setRequired(true)
    )
    .addIntegerOption(
      /**
       * Configures the required `minutes` integer option.
       *
       * @param {import("discord.js").SlashCommandIntegerOption} o - The duration option being configured.
       * @returns {import("discord.js").SlashCommandIntegerOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /timeout command.
       */
      (o) =>
        o
          .setName("minutes")
          .setDescription("Duration in minutes (max 40320 = 28 days)")
          .setMinValue(1)
          .setMaxValue(40320)
          .setRequired(true)
    )
    .addStringOption(
      /**
       * Configures the optional `reason` string option.
       *
       * @param {import("discord.js").SlashCommandStringOption} o - The reason option being configured.
       * @returns {import("discord.js").SlashCommandStringOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /timeout command.
       */
      (o) => o.setName("reason").setDescription("Reason for the timeout")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),
  /**
   * Validates the invoker's permissions and the target member, then applies
   * the Discord timeout for the requested number of minutes.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the timeout is applied and the confirmation reply sent.
   * @throws {import("discord.js").DiscordAPIError} If applying the timeout or replying fails.
   * @example
   * // Triggered when a moderator runs /timeout target:@user minutes:10 in Discord.
   */
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        content: "❌ You need the **Moderate Members** permission to use this.",
        ephemeral: true,
      });
    }

    const member = interaction.options.getMember("target");
    const minutes = interaction.options.getInteger("minutes", true);
    const reason = interaction.options.getString("reason") ?? "No reason provided";

    if (!member) {
      return interaction.reply({ content: "That user isn't a member of this server.", ephemeral: true });
    }
    if (member.id === interaction.user.id) {
      return interaction.reply({ content: "You can't time yourself out.", ephemeral: true });
    }
    if (!member.moderatable) {
      return interaction.reply({
        content: "I can't timeout that member — their role is above mine or I lack permissions.",
        ephemeral: true,
      });
    }

    await member.timeout(minutes * 60 * 1000, reason);
    await interaction.reply({
      content: `🔇 Timed out **${member.user.tag}** for **${minutes}** minute(s) — reason: ${reason}`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  },
};
