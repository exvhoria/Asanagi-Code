import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { store } from "../store.js";

export default {
  data: new SlashCommandBuilder()
    .setName("welcome-message")
    .setDescription("Configure where welcome messages are posted")
    .addSubcommand(
      /**
       * Defines the `set` subcommand and its channel option.
       *
       * @param {import("discord.js").SlashCommandSubcommandBuilder} sc - The "set" subcommand being configured.
       * @returns {import("discord.js").SlashCommandSubcommandBuilder} The configured subcommand.
       * @throws {never} Only configures discord.js builders.
       * @example
       * // Applied while defining the /welcome-message command.
       */
      (sc) =>
        sc
          .setName("set")
          .setDescription("Set the channel for welcome messages")
          .addChannelOption(
            /**
             * Configures the required welcome `channel` option.
             *
             * @param {import("discord.js").SlashCommandChannelOption} o - The channel option being configured.
             * @returns {import("discord.js").SlashCommandChannelOption} The configured option.
             * @throws {never} Only configures a discord.js builder.
             * @example
             * // Applied while defining /welcome-message set.
             */
            (o) =>
              o
                .setName("channel")
                .setDescription("Channel to post welcome embeds in")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          )
    )
    .addSubcommand(
      /**
       * Defines the `clear` subcommand.
       *
       * @param {import("discord.js").SlashCommandSubcommandBuilder} sc - The "clear" subcommand being configured.
       * @returns {import("discord.js").SlashCommandSubcommandBuilder} The configured subcommand.
       * @throws {never} Only configures discord.js builders.
       * @example
       * // Applied while defining the /welcome-message command.
       */
      (sc) => sc.setName("clear").setDescription("Disable welcome messages")
    )
    .addSubcommand(
      /**
       * Defines the `show` subcommand.
       *
       * @param {import("discord.js").SlashCommandSubcommandBuilder} sc - The "show" subcommand being configured.
       * @returns {import("discord.js").SlashCommandSubcommandBuilder} The configured subcommand.
       * @throws {never} Only configures discord.js builders.
       * @example
       * // Applied while defining the /welcome-message command.
       */
      (sc) => sc.setName("show").setDescription("Show the current welcome channel")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  /**
   * Handles the /welcome-message subcommands: sets, clears, or shows the
   * channel where welcome messages are posted, guarded by Manage Guild.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the confirmation or status reply has been sent.
   * @throws {import("discord.js").DiscordAPIError} If replying to the interaction fails.
   * @example
   * // Triggered when a moderator runs /welcome-message set channel:#general in Discord.
   */
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "❌ You need the **Manage Server** permission to use this.",
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
      const channel = interaction.options.getChannel("channel", true);
      store.set(interaction.guildId, "welcomeChannel", channel.id);
      return interaction.reply({
        content: `✅ Welcome messages will be posted in ${channel}.`,
        ephemeral: true,
      });
    }

    if (sub === "clear") {
      store.set(interaction.guildId, "welcomeChannel", null);
      return interaction.reply({ content: "✅ Welcome messages disabled.", ephemeral: true });
    }

    const channelId = store.get(interaction.guildId, "welcomeChannel");
    return interaction.reply({
      content: channelId
        ? `Current welcome channel: <#${channelId}>`
        : "No welcome channel configured. Use `/welcome-message set`.",
      ephemeral: true,
    });
  },
};
