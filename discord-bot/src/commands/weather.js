import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { COLORS } from "../colors.js";

/** Timeout applied to both geocoding and forecast fetches, in milliseconds. */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Formats a numeric weather field, falling back to "N/A" when open-meteo
 * reports null or a non-numeric value (which happens for some coordinates,
 * e.g. over open ocean).
 *
 * @param {unknown} value - The raw field value from the weather API.
 * @param {string} unit - Unit suffix appended to the number.
 * @returns {string} A human-readable field value.
 * @throws {never} Pure formatting.
 * @example
 * fmt(21.4, "°C"); // "21.4°C"
 * fmt(null, "°C"); // "N/A"
 */
function fmt(value, unit) {
  return typeof value === "number" && Number.isFinite(value) ? `${value}${unit}` : "N/A";
}

/**
 * Maps open-meteo WMO weather codes to human-readable descriptions; codes not
 * present here are simply omitted from the reply embed.
 *
 * @type {Record<number, string>}
 * @example
 * WEATHER_CODES[0]; // "Clear sky"
 */
const WEATHER_CODES = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export default {
  data: new SlashCommandBuilder()
    .setName("weather")
    .setDescription("Current weather for a city (no API key needed)")
    .addStringOption(
      /**
       * Configures the required `city` string option.
       *
       * @param {import("discord.js").SlashCommandStringOption} o - The city option being configured.
       * @returns {import("discord.js").SlashCommandStringOption} The configured option.
       * @throws {never} Only configures a discord.js builder.
       * @example
       * // Applied while defining the /weather command.
       */
      (o) =>
        o
          .setName("city")
          .setDescription("City name, e.g. Berlin or New York")
          .setMaxLength(100)
          .setRequired(true)
    ),
  /**
   * Geocodes the requested city, fetches the current weather from open-meteo,
   * and replies with an embed of temperature, humidity, wind, and conditions.
   *
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The slash-command interaction.
   * @returns {Promise<void>} Resolves once the weather embed or an error message has been sent.
   * @throws {import("discord.js").DiscordAPIError} If deferring or editing the reply fails.
   * @example
   * // Triggered when a user runs /weather city:Berlin in Discord.
   */
  async execute(interaction) {
    const city = interaction.options.getString("city", true).trim();
    await interaction.deferReply();

    let geo;
    try {
      const geoUrl =
        "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" +
        encodeURIComponent(city);
      const response = await fetch(geoUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`geocoding returned ${response.status}`);
      geo = await response.json();
    } catch (error) {
      console.error("[weather] Geocoding failed:", error);
      return interaction.editReply("⚠️ Couldn't reach the geocoding service. Try again later.");
    }

    const place = geo?.results?.[0];
    if (!place || typeof place.latitude !== "number" || typeof place.longitude !== "number") {
      return interaction.editReply({
        content: `🔎 I couldn't find a city called **${city}**.`,
        allowedMentions: { parse: [] },
      });
    }

    let forecast;
    try {
      const weatherUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code";
      const response = await fetch(weatherUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`open-meteo returned ${response.status}`);
      forecast = await response.json();
    } catch (error) {
      console.error("[weather] Forecast failed:", error);
      return interaction.editReply("⚠️ Couldn't reach the weather service. Try again later.");
    }

    const current = forecast?.current;
    if (!current) {
      return interaction.editReply("⚠️ The weather service didn't return any data for that city.");
    }

    const where = [place.name, place.admin1, place.country].filter(Boolean).join(", ") || "Unknown location";
    const embed = new EmbedBuilder()
      .setTitle(`🌤️ ${where}`)
      .setColor(COLORS.brand)
      .addFields(
        {
          name: "Temperature",
          value: `${fmt(current.temperature_2m, "°C")} (feels like ${fmt(current.apparent_temperature, "°C")})`,
          inline: true,
        },
        { name: "Humidity", value: fmt(current.relative_humidity_2m, "%"), inline: true },
        { name: "Wind", value: fmt(current.wind_speed_10m, " km/h"), inline: true }
      )
      .setTimestamp();

    const description = WEATHER_CODES[current.weather_code];
    if (description) embed.setDescription(description);

    await interaction.editReply({ embeds: [embed] });
  },
};
