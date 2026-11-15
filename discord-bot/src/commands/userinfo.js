import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { COLORS } from "../colors.js";

export default {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show information about a user")
    .addUserOption(
      /**
       * Configures the optional `target` user option.
       *
       * @param {import("discord.js").SlashCommandUserOption} o - The user option being configured.
       * @returns {import("discord.js").SlashCommandUserOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /userinfo command.
       */
      (o) =>
        o.setName("target").setDescription("The user to inspect (defaults to you)")
    ),
  /**
   * Handle the `/userinfo` slash command: builds and replies with an embed
   * describing the target user (tag, ID, bot status, account creation) and, when
   * they are a guild member, their nickname, join date, and highest role.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the embed reply is sent.
   * @throws {import("discord.js").DiscordAPIError} If the reply fails.
   * @example
   * // Triggered when a user runs /userinfo in Discord.
   */
  async execute(interaction) {
    const target = interaction.options.getUser("target");
    const user = target ?? interaction.user;
    const member = target
      ? interaction.options.getMember("target")
      : interaction.member;

    const embed = new EmbedBuilder()
      .setTitle(`User info — ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setColor(COLORS.brand)
      .addFields(
        { name: "Tag", value: user.tag, inline: true },
        { name: "ID", value: user.id, inline: true },
        { name: "Bot", value: user.bot ? "Yes" : "No", inline: true },
        {
          name: "Account created",
          value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
          inline: true,
        }
      );

    if (member) {
      embed.addFields(
        { name: "Nickname", value: member.nickname ?? "None", inline: true },
        {
          name: "Joined server",
          value: member.joinedTimestamp
            ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
            : "Unknown",
          inline: true,
        },
        {
          name: "Highest role",
          value: member.roles.highest?.name ?? "None",
          inline: true,
        }
      );
    }

    await interaction.reply({ embeds: [embed] });
  },
};
