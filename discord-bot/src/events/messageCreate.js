import { Events } from "discord.js";
import { recordMessage } from "../statsStore.js";

export default {
  name: Events.MessageCreate,
  /**
   * Records a message count for the channel, ignoring DMs and bot messages.
   *
   * @param {import("discord.js").Message} message - The created message.
   * @returns {Promise<void>}
   * @throws {never} In-memory stats update only.
   * @example
   * // Wired up automatically in src/index.js as an Events.MessageCreate handler.
   */
  async execute(message) {
    if (!message.inGuild() || message.author?.bot) return;
    recordMessage(message.guildId, message.channelId);
  },
};
