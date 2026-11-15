import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the data/ directory holding the settings store. */
const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
/** Absolute path of the settings.json file persisted by this module. */
const filePath = path.join(dataDir, "settings.json");

/**
 * Checks whether a value is a plain (non-null, non-array) object.
 *
 * @param {unknown} value - Value to test.
 * @returns {boolean} True when the value is a plain object.
 * @throws {never} Pure type check.
 * @example
 * isPlainObject({}); // true
 * isPlainObject("oops"); // false
 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads and parses data/settings.json.
 *
 * @returns {Record<string, Record<string, *>>} All stored settings, or an empty object when the file is missing or invalid.
 * @throws {never} Never throws; unreadable or malformed JSON falls back to an empty object.
 * @example
 * readAll(); // e.g. { "123": { welcomeChannel: "456" } }
 */
function readAll() {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // fall through to a fresh store
  }
  return {};
}

/**
 * Writes all settings to data/settings.json, creating the data directory
 * if needed.
 *
 * @param {Record<string, Record<string, *>>} data - Full settings map to persist.
 * @returns {void}
 * @throws {Error} When the data directory cannot be created or the file cannot be written.
 * @example
 * writeAll({ "123": { welcomeChannel: "456" } });
 */
function writeAll(data) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

/**
 * Persistent per-guild, per-key settings backed by data/settings.json.
 * The file is read and written on every access, so values survive restarts.
 */
export const store = {
  /**
   * Reads a stored value.
   *
   * @param {string} guildId - Discord ID of the guild the setting belongs to.
   * @param {string} key - Setting key.
   * @returns {*} The stored value, or undefined when the guild or key is unset.
   * @throws {never} Never throws; unreadable or malformed JSON is treated as no settings.
   * @example
   * store.get("123", "welcomeChannel"); // "456" or undefined
   */
  get(guildId, key) {
    return readAll()[guildId]?.[key];
  },
  /**
   * Writes a value, creating the data directory and file as needed.
   *
   * @param {string} guildId - Discord ID of the guild the setting belongs to.
   * @param {string} key - Setting key.
   * @param {*} value - JSON-serializable value to persist.
   * @returns {void}
   * @throws {Error} When the data directory cannot be created or the file cannot be written.
   * @example
   * store.set("123", "welcomeChannel", "456");
   */
  set(guildId, key, value) {
    const all = readAll();
    if (!isPlainObject(all[guildId])) all[guildId] = {};
    all[guildId][key] = value;
    writeAll(all);
  },
};
