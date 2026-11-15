import { ActivityType, Events } from "discord.js";
import { startAutoSave } from "../statsStore.js";

export default {
  name: Events.ClientReady,
  once: true,
  /**
   * Logs the bot's identity, sets its presence to "/help", and starts the
   * five-minute stats auto-save loop.
   *
   * @param {import("discord.js").Client} client - The logged-in client.
   * @returns {Promise<void>}
   * @throws {never} Never throws; a setActivity failure would only produce an unhandled rejection.
   * @example
   * // Wired up automatically in src/index.js as a once-only ready handler.
   */
  async execute(client) {
    console.log(
      `[ready] Logged in as ${client.user.tag} (${client.user.id}) in ${client.guilds.cache.size} guild(s).`
    );
    client.user.setActivity("/help", { type: ActivityType.Listening });

    startAutoSave(5 * 60 * 1000);
    console.log("[ready] Message stats auto-save every 5 minutes.");
  },
};
