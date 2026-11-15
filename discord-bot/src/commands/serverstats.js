import { ChannelType, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { COLORS } from "../colors.js";
import { topChannels, totalMessages, trackedChannelCount } from "../statsStore.js";

export default {
  data: new SlashCommandBuilder()
    .setName("serverstats")
    .setDescription("Show how many messages the bot has tracked per channel"),
  /**
   * Reads the tracked message counts for the guild and replies with an embed
   * listing the top channels and aggregate statistics.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the stats embed or an empty-state message has been sent.
   * @throws {import("discord.js").DiscordAPIError} If replying to the interaction fails.
   * @example
   * // Triggered when a user runs /serverstats in a guild.
   */
  async execute(interaction) {
    const { guild } = interaction;
    if (!guild) {
      return interaction.reply({ content: "This command only works in a server.", ephemeral: true });
    }

    const total = totalMessages(guild.id);
    if (total === 0) {
      return interaction.reply({
        content: "No messages tracked yet — say something in a channel and check back later.",
        ephemeral: true,
      });
    }

    const lines = topChannels(guild.id, 25).map(
      /**
       * Formats one channel's message count as a numbered leaderboard line.
       *
       * @param {{ channelId: string, count: number }} entry - A channel's message-count entry.
       * @param {number} index - The zero-based rank of the entry.
       * @returns {string} A formatted leaderboard line for the channel.
       * @throws {never} String interpolation only.
       * @example
       * // Produces lines such as "1. <#456> — **42** message(s)".
       */
      (entry, index) => `${index + 1}. <#${entry.channelId}> — **${entry.count}** message(s)`
    );
    const trackedChannels = guild.channels.cache.filter(
      /**
       * Checks whether a cached channel is a guild text channel.
       *
       * @param {import("discord.js").GuildBasedChannel} c - A guild channel from the cache.
       * @returns {boolean} Whether the channel is a text channel.
       * @throws {never} Pure type comparison.
       * @example
       * // Used to report the number of text channels in /serverstats.
       */
      (c) => c.type === ChannelType.GuildText
    ).size;

    const embed = new EmbedBuilder()
      .setTitle(`📊 Message stats — ${guild.name}`)
      .setColor(COLORS.brand)
      .setDescription(lines.join("\n"))
      .addFields(
        { name: "Total messages", value: String(total), inline: true },
        { name: "Tracked in", value: String(trackedChannelCount(guild.id)), inline: true },
        { name: "Text channels", value: String(trackedChannels), inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
