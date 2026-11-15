import { ChannelType, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { COLORS } from "../colors.js";

export default {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show information about this server"),
  /**
   * Handle the `/serverinfo` slash command: builds and replies with an embed
   * summarizing the guild (ID, owner, member count, creation date, channel and
   * role counts, and boost count).
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the embed reply is sent.
   * @throws {import("discord.js").DiscordAPIError} If the reply fails.
   * @example
   * // Triggered when a user runs /serverinfo in Discord.
   */
  async execute(interaction) {
    const { guild } = interaction;
    if (!guild) {
      return interaction.reply({ content: "This command only works in a server.", ephemeral: true });
    }

    const channels = guild.channels.cache;
    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .setColor(COLORS.brand)
      .addFields(
        { name: "Server ID", value: guild.id, inline: true },
        { name: "Owner", value: `<@${guild.ownerId}>`, inline: true },
        { name: "Members", value: String(guild.memberCount), inline: true },
        {
          name: "Created",
          value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
          inline: true,
        },
        {
          name: "Text channels",
          value: String(
            channels.filter(
              /**
               * Checks whether a cached channel is a guild text channel.
               *
               * @param {import("discord.js").GuildBasedChannel} c - The channel being tested.
               * @returns {boolean} True if the channel is a text channel.
               * @throws {never} Pure type comparison.
               * @example
               * // Used to count text channels for the /serverinfo embed.
               */
              (c) => c.type === ChannelType.GuildText
            ).size
          ),
          inline: true,
        },
        {
          name: "Voice channels",
          value: String(
            channels.filter(
              /**
               * Checks whether a cached channel is a guild voice channel.
               *
               * @param {import("discord.js").GuildBasedChannel} c - The channel being tested.
               * @returns {boolean} True if the channel is a voice channel.
               * @throws {never} Pure type comparison.
               * @example
               * // Used to count voice channels for the /serverinfo embed.
               */
              (c) => c.type === ChannelType.GuildVoice
            ).size
          ),
          inline: true,
        },
        { name: "Roles", value: String(guild.roles.cache.size), inline: true },
        { name: "Boosts", value: String(guild.premiumSubscriptionCount ?? 0), inline: true }
      );

    await interaction.reply({ embeds: [embed] });
  },
};
