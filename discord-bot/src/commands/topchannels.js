import { SlashCommandBuilder } from "discord.js";
import { topChannels } from "../statsStore.js";

export default {
  data: new SlashCommandBuilder()
    .setName("topchannels")
    .setDescription("Show the leaderboard of the most active channels"),
  /**
   * Reads the tracked message counts for the guild and replies with a
   * leaderboard of the ten most active channels.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the leaderboard or an empty-state message has been sent.
   * @throws {import("discord.js").DiscordAPIError} If replying to the interaction fails.
   * @example
   * // Triggered when a user runs /topchannels in a guild.
   */
  async execute(interaction) {
    const { guild } = interaction;
    if (!guild) {
      return interaction.reply({ content: "This command only works in a server.", ephemeral: true });
    }

    const top = topChannels(guild.id, 10);
    if (top.length === 0) {
      return interaction.reply({
        content: "No messages tracked yet — say something in a channel and check back later.",
        ephemeral: true,
      });
    }

    const medals = ["🥇", "🥈", "🥉"];
    const lines = top.map(
      /**
       * Formats one channel's message count as a medal or numbered line.
       *
       * @param {{ channelId: string, count: number }} entry - A channel's message-count entry.
       * @param {number} index - The zero-based rank of the entry.
       * @returns {string} A formatted leaderboard line for the channel.
       * @throws {never} String interpolation only.
       * @example
       * // Produces lines such as "🥇 <#456> — **42** message(s)".
       */
      (entry, index) =>
        `${medals[index] ?? `**#${index + 1}**`} <#${entry.channelId}> — **${entry.count}** message(s)`
    );

    await interaction.reply(`🏆 **Most active channels**\n${lines.join("\n")}`);
  },
};
