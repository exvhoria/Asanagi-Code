import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server")
    .addUserOption(
      /**
       * Configures the required `target` user option.
       *
       * @param {import("discord.js").SlashCommandUserOption} o - The user option being configured.
       * @returns {import("discord.js").SlashCommandUserOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /kick command.
       */
      (o) => o.setName("target").setDescription("The member to kick").setRequired(true)
    )
    .addStringOption(
      /**
       * Configures the optional `reason` string option.
       *
       * @param {import("discord.js").SlashCommandStringOption} o - The string option being configured.
       * @returns {import("discord.js").SlashCommandStringOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /kick command.
       */
      (o) => o.setName("reason").setDescription("Reason for the kick")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false),
  /**
   * Handle the `/kick` slash command: validates the invoker's permissions and the
   * target member, then kicks them from the guild with an optional reason.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the kick and the confirmation reply complete.
   * @throws {import("discord.js").DiscordAPIError} If the kick API call or the reply fails.
   * @example
   * // Triggered when a user runs /kick in Discord.
   */
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply({
        content: "❌ You need the **Kick Members** permission to use this.",
        ephemeral: true,
      });
    }

    const user = interaction.options.getUser("target", true);
    const member = interaction.options.getMember("target");
    const reason = interaction.options.getString("reason") ?? "No reason provided";

    if (!member) {
      return interaction.reply({ content: "That user isn't a member of this server.", ephemeral: true });
    }
    if (member.id === interaction.user.id) {
      return interaction.reply({ content: "You can't kick yourself.", ephemeral: true });
    }
    if (!member.kickable) {
      return interaction.reply({
        content: "I can't kick that member — their role is above mine or I lack permissions.",
        ephemeral: true,
      });
    }

    await member.kick(reason);
    await interaction.reply({
      content: `👢 Kicked **${user.tag}** — reason: ${reason}`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  },
};
