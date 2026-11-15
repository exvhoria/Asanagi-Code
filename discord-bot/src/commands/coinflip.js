import { SlashCommandBuilder } from "discord.js";
import { flipCoin } from "../lib/randomness.js";

export default {
  data: new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a coin"),
  /**
   * Flips a coin and replies with the result (Heads or Tails).
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the coin flip result has been sent.
   * @throws {import("discord.js").DiscordAPIError} If replying to the interaction fails.
   * @example
   * // Triggered when a user runs /coinflip in Discord.
   */
  async execute(interaction) {
    const result = flipCoin();
    await interaction.reply(`🪙 The coin landed on **${result}**!`);
  },
};
