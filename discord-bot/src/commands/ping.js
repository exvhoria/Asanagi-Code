import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check the bot's latency"),
  /**
   * Measures the bot's roundtrip latency and WebSocket heartbeat, then edits the
   * initial "Pinging..." reply with the results.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the reply has been edited with the latency figures.
   * @throws {import("discord.js").DiscordAPIError} If replying or editing the reply fails.
   * @example
   * // Triggered when a user runs /ping in Discord.
   */
  async execute(interaction) {
    await interaction.reply("🏓 Pinging...");
    const reply = await interaction.fetchReply();
    const roundtrip = reply.createdTimestamp - interaction.createdTimestamp;
    const ws = interaction.client.ws.ping;
    const wsText = Number.isFinite(ws) && ws >= 0 ? `${Math.round(ws)}ms` : "measuring...";
    await interaction.editReply(
      `🏓 Pong! Roundtrip: **${roundtrip}ms** · WebSocket heartbeat: **${wsText}**`
    );
  },
};
