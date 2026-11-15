import { SlashCommandBuilder } from "discord.js";
import { pick8BallResponse } from "../lib/randomness.js";

export default {
  data: new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask the magic 8-ball a yes/no question")
    .addStringOption(
      /**
       * Configures the required `question` string option.
       *
       * @param {import("discord.js").SlashCommandStringOption} o - The string option being configured.
       * @returns {import("discord.js").SlashCommandStringOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /8ball command.
       */
      (o) =>
        o
          .setName("question")
          .setDescription("Your question for the 8-ball")
          .setMaxLength(1000)
          .setRequired(true)
    ),
  /**
   * Handle the `/8ball` slash command: picks a random 8-ball answer and replies
   * quoting the user's question alongside it.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the answer reply is sent.
   * @throws {import("discord.js").DiscordAPIError} If the reply fails.
   * @example
   * // Triggered when a user runs /8ball in Discord.
   */
  async execute(interaction) {
    const question = interaction.options.getString("question", true);
    const answer = pick8BallResponse();
    await interaction.reply({
      content: `🎱 **Question:** ${question}\n**Answer:** ${answer}`,
      allowedMentions: { parse: [] },
    });
  },
};
