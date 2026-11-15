import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordMessage as bumpCount, topChannels as sortChannels, totalMessages as sumCounts } from "./lib/stats.js";

/** Absolute path of the data/ directory holding the stats and settings stores. */
const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
/** Absolute path of the stats.json file persisted by this module. */
const filePath = path.join(dataDir, "stats.json");

/**
 * In-memory message counts, loaded once from stats.json at module load:
 * guild ID → channel ID → message count.
 *
 * @type {Record<string, Record<string, number>>}
 */
const counts = load();
normalize();

/**
 * Loads message counts from data/stats.json.
 *
 * @returns {Record<string, Record<string, number>>} Map of guild ID to channel ID to message count; an empty object when the file is missing or invalid.
 * @throws {never} Never throws; unreadable or malformed JSON falls back to a fresh empty store.
 * @example
 * const counts = load(); // e.g. { "123": { "456": 7 } }
 */
function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // fall through to a fresh store
  }
  return {};
}

/**
 * Returns the per-channel count map for a guild, creating an empty one if missing.
 *
 * @param {string} guildId - Discord ID of the guild.
 * @returns {Record<string, number>} Map of channel ID to message count for the guild.
 * @throws {never} Only mutates the in-memory counts object.
 * @example
 * guildCounts("123")["456"] ??= 0;
 */
function guildCounts(guildId) {
  if (!isPlainObject(counts[guildId])) counts[guildId] = {};
  return counts[guildId];
}

/**
 * Returns the stored per-channel count map for a guild without mutating state.
 * Used by read-only accessors; an absent or malformed guild entry reads as empty.
 *
 * @param {string} guildId - Discord ID of the guild.
 * @returns {Record<string, number>} Map of channel ID to message count for the guild.
 * @throws {never} Pure read of the in-memory counts object.
 * @example
 * peekGuildCounts("123"); // {} when the guild has no recorded messages
 */
function peekGuildCounts(guildId) {
  const channels = counts[guildId];
  return isPlainObject(channels) ? channels : {};
}

/**
 * Checks whether a value is a plain (non-array, non-null) object.
 *
 * @param {unknown} value - Value to test.
 * @returns {boolean} True when the value is a non-null, non-array object.
 * @throws {never} Pure type check.
 * @example
 * isPlainObject({}); // true
 * isPlainObject([1]); // false
 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Removes malformed entries from the in-memory counts: non-object guild maps,
 * non-integer or out-of-range channel counts, and guild maps left empty.
 *
 * @returns {void}
 * @throws {never} Mutates only the in-memory counts object.
 * @example
 * normalize(); // call before persisting with save()
 */
function normalize() {
  for (const [guildId, channels] of Object.entries(counts)) {
    if (!isPlainObject(channels)) {
      delete counts[guildId];
      continue;
    }
    for (const [channelId, count] of Object.entries(channels)) {
      if (!Number.isInteger(count) || count < 1) delete channels[channelId];
    }
    if (Object.keys(channels).length === 0) delete counts[guildId];
  }
}

/**
 * Records one message sent in a channel of a guild.
 *
 * @param {string} guildId - Discord ID of the guild the message was sent in.
 * @param {string} channelId - Discord ID of the channel the message was sent in.
 * @returns {void}
 * @throws {never} Only mutates in-memory state.
 * @example
 * recordMessage("123", "456");
 */
export function recordMessage(guildId, channelId) {
  bumpCount(guildCounts(guildId), channelId);
}

/**
 * Returns a guild's most active channels, highest message count first.
 *
 * @param {string} guildId - Discord ID of the guild.
 * @param {number} limit - Maximum number of channels to return.
 * @returns {{ channelId: string, count: number }[]} Up to `limit` channels.
 * @throws {never} Pure sorting of in-memory data.
 * @example
 * topChannels("123", 5); // e.g. [{ channelId: "456", count: 42 }, ...]
 */
export function topChannels(guildId, limit) {
  return sortChannels(peekGuildCounts(guildId), limit);
}

/**
 * Sums the message counts of every channel in a guild.
 *
 * @param {string} guildId - Discord ID of the guild.
 * @returns {number} Total messages recorded for the guild.
 * @throws {never} Pure arithmetic on in-memory data.
 * @example
 * totalMessages("123"); // e.g. 1042
 */
export function totalMessages(guildId) {
  return sumCounts(peekGuildCounts(guildId));
}

/**
 * Counts the channels that have recorded messages for a guild, regardless of
 * any display limit applied elsewhere.
 *
 * @param {string} guildId - Discord ID of the guild.
 * @returns {number} Number of channels with at least one recorded message.
 * @throws {never} Pure counting of in-memory data.
 * @example
 * trackedChannelCount("123"); // e.g. 31
 */
export function trackedChannelCount(guildId) {
  return Object.keys(peekGuildCounts(guildId)).length;
}

/**
 * Normalizes the counts and writes them to data/stats.json, creating the
 * data directory if needed.
 *
 * @returns {void}
 * @throws {Error} When the data directory cannot be created or the file cannot be written.
 * @example
 * save();
 */
export function save() {
  normalize();
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(counts, null, 2));
  fs.renameSync(tmp, filePath);
}

/**
 * Performs one auto-save tick, logging rather than propagating failures so
 * the interval is not interrupted.
 *
 * @returns {void}
 * @throws {never} Save failures are caught and logged.
 * @example
 * autoSaveTick();
 */
function autoSaveTick() {
  try {
    save();
  } catch (error) {
    console.error("[statsStore] Auto-save failed:", error);
  }
}

/**
 * Starts a periodic background save of the stats store. The returned timer
 * is unref'd so it does not keep the process alive on its own.
 *
 * @param {number} intervalMs - Interval between saves in milliseconds.
 * @returns {NodeJS.Timeout} The interval timer (unref'd when supported).
 * @throws {never} Save failures are handled by the interval callback.
 * @example
 * startAutoSave(5 * 60 * 1000); // save every 5 minutes
 */
export function startAutoSave(intervalMs) {
  const timer = setInterval(autoSaveTick, intervalMs);
  timer.unref?.();
  return timer;
}
