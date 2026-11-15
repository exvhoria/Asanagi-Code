import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { COLORS } from "../colors.js";

export default {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Show a user's avatar")
    .addUserOption(
      /**
       * Configures the optional `target` user option.
       *
       * @param {import("discord.js").SlashCommandUserOption} o - The user option being configured.
       * @returns {import("discord.js").SlashCommandUserOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /avatar command.
       */
      (o) =>
        o.setName("target").setDescription("Whose avatar to show (defaults to you)")
    ),
  /**
   * Handle the `/avatar` slash command: builds and replies with an embed showing
   * the target user's avatar plus direct PNG and WebP links.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the embed reply is sent.
   * @throws {import("discord.js").DiscordAPIError} If the reply fails.
   * @example
   * // Triggered when a user runs /avatar in Discord.
   */
  async execute(interaction) {
    const user = interaction.options.getUser("target") ?? interaction.user;
    const png = user.displayAvatarURL({ extension: "png", size: 1024 });
    const webp = user.displayAvatarURL({ extension: "webp", size: 1024 });

    const embed = new EmbedBuilder()
      .setTitle(`${user.username}'s avatar`)
      .setImage(user.displayAvatarURL({ size: 1024 }))
      .setDescription(`[PNG](${png}) • [WebP](${webp})`)
      .setColor(COLORS.brand);

    await interaction.reply({ embeds: [embed] });
  },
};
