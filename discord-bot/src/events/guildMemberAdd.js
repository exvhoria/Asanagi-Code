import { EmbedBuilder, Events } from "discord.js";
import { store } from "../store.js";
import { COLORS } from "../colors.js";

/**
 * Swallows a channel fetch error and returns null so the caller can treat the
 * channel as unavailable.
 *
 * @returns {null} Always null.
 * @throws {never} Never throws.
 * @example
 * await guild.channels.fetch(id).catch(ignoreFetchError);
 */
function ignoreFetchError() {
  return null;
}

/**
 * Logs a failure to send the welcome message.
 *
 * @param {unknown} error - The send failure reason.
 * @returns {void}
 * @throws {never} Only writes to stderr.
 * @example
 * channel.send({ embeds }).catch(logSendError);
 */
function logSendError(error) {
  console.error("[guildMemberAdd] Failed to send welcome message:", error);
}

export default {
  name: Events.GuildMemberAdd,
  /**
   * Sends a welcome embed to the guild's configured welcome channel.
   * No-op when no welcome channel is configured or it cannot be resolved.
   *
   * @param {import("discord.js").GuildMember} member - The member who joined the guild.
   * @returns {Promise<void>}
   * @throws {never} Never throws; channel fetch and send failures are caught and logged.
   * @example
   * // Wired up automatically in src/index.js as an Events.GuildMemberAdd handler.
   */
  async execute(member) {
    const channelId = store.get(member.guild.id, "welcomeChannel");
    if (!channelId) return;

    const channel =
      member.guild.channels.cache.get(channelId) ??
      (await member.guild.channels.fetch(channelId).catch(ignoreFetchError));
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle("👋 Welcome!")
      .setDescription(
        `Hey ${member.user}, welcome to **${member.guild.name}**! You are member #${member.guild.memberCount}.`
      )
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setColor(COLORS.success)
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(logSendError);
  },
};
