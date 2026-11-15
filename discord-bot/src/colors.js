/**
 * Shared embed colors used throughout the bot, expressed as 24-bit RGB
 * integers accepted by discord.js embed builders.
 *
 * @type {{ brand: number, success: number, error: number }}
 * @example
 * new EmbedBuilder().setColor(COLORS.brand);
 */
export const COLORS = {
  brand: 0x5865f2,
  success: 0x57f287,
  error: 0xed4245,
};
