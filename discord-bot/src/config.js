import "dotenv/config";

/**
 * Reads a required environment variable, terminating the process when unset.
 *
 * @param {string} name - Name of the environment variable to read.
 * @returns {string} The variable's value.
 * @throws {never} Does not throw; prints an error and calls process.exit(1) when the variable is missing.
 * @example
 * const token = requireEnv("DISCORD_TOKEN");
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] Missing ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

/**
 * Reads a numeric environment variable with a fallback. Unset or empty
 * values, non-finite values, and values below `min` all fall back
 * (with a warning) instead of failing.
 *
 * @param {string} name - Name of the environment variable to read.
 * @param {number} fallback - Value used when the variable is unset, empty, or invalid.
 * @param {number} min - Minimum accepted value.
 * @returns {number} The parsed value, or the fallback.
 * @throws {never} Never throws; invalid input falls back with a warning.
 * @example
 * optionalNumber("COMMAND_COOLDOWN_SECONDS", 3, 0); // e.g. 3
 */
function optionalNumber(name, fallback, min) {
  const raw = process.env[name]?.trim();
  const value = Number(raw ?? fallback);
  if (raw === "" || !Number.isFinite(value) || value < min) {
    console.warn(`[config] ${name} is invalid, falling back to ${fallback}.`);
    return fallback;
  }
  return value;
}

export const config = {
  token: requireEnv("DISCORD_TOKEN"),
  clientId: requireEnv("CLIENT_ID"),
  guildId: process.env.GUILD_ID || null,
  commandCooldownSeconds: optionalNumber("COMMAND_COOLDOWN_SECONDS", 3, 0),
};
