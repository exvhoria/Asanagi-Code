/** Maximum number of times the /repeat command may repeat a string. */
export const MAX_REPEAT_TIMES = 5;
/** Maximum length, in characters, of text accepted by /repeat. */
export const MAX_REPEAT_LENGTH = 200;

/**
 * Increments the stored message count for a channel, mutating `counts` in place.
 *
 * @param {Record<string, number>} counts - Map of channel ID to message count.
 * @param {string} channelId - Discord ID of the channel the message was sent in.
 * @returns {number} The channel's new count.
 * @throws {never} Pure in-memory arithmetic.
 * @example
 * recordMessage({ "456": 1 }, "456"); // returns 2
 */
export function recordMessage(counts, channelId) {
  counts[channelId] = (counts[channelId] ?? 0) + 1;
  return counts[channelId];
}

/**
 * Converts a [channelId, count] entry into a plain object.
 *
 * @param {[string, number]} entry - A [channelId, count] pair.
 * @returns {{ channelId: string, count: number }} The pair as an object.
 * @throws {never} Pure destructuring.
 * @example
 * toEntry(["456", 3]); // { channelId: "456", count: 3 }
 */
function toEntry([channelId, count]) {
  return { channelId, count };
}

/**
 * Orders two channel entries by count descending, then channel ID ascending.
 *
 * @param {{ channelId: string, count: number }} a - First entry.
 * @param {{ channelId: string, count: number }} b - Second entry.
 * @returns {number} Negative when a ranks before b.
 * @throws {never} Pure comparison.
 * @example
 * // Used as the comparator passed to Array#sort below.
 */
function compareEntries(a, b) {
  return b.count - a.count || a.channelId.localeCompare(b.channelId);
}

/**
 * Returns a guild's channels sorted by message count, highest first, ties
 * broken by channel ID.
 *
 * @param {Record<string, number>} counts - Map of channel ID to message count.
 * @param {number} [limit=10] - Maximum number of channels to return.
 * @returns {{ channelId: string, count: number }[]} Up to `limit` entries.
 * @throws {never} Pure sorting of in-memory data.
 * @example
 * topChannels({ "456": 3, "789": 5 }); // [{ channelId: "789", count: 5 }, ...]
 */
export function topChannels(counts, limit = 10) {
  const max = Math.max(0, Math.floor(limit));
  return Object.entries(counts).map(toEntry).sort(compareEntries).slice(0, max);
}

/**
 * Adds one channel count to the running total.
 *
 * @param {number} sum - Accumulated total so far.
 * @param {number} count - The current channel's count.
 * @returns {number} The updated total.
 * @throws {never} Pure addition.
 * @example
 * [3, 5].reduce(addCount, 0); // 8
 */
function addCount(sum, count) {
  return sum + count;
}

/**
 * Sums the message counts of every channel in the map.
 *
 * @param {Record<string, number>} counts - Map of channel ID to message count.
 * @returns {number} Total messages across all channels.
 * @throws {never} Pure arithmetic.
 * @example
 * totalMessages({ "456": 3, "789": 5 }); // 8
 */
export function totalMessages(counts) {
  return Object.values(counts).reduce(addCount, 0);
}

/**
 * Validates the text and repeat count for the /repeat command against the
 * module's limits.
 *
 * @param {string} text - Text intended for repetition.
 * @param {number} times - Requested number of repetitions.
 * @returns {{ ok: true } | { ok: false, error: string }} Validation result with an error message when invalid.
 * @throws {never} Validation only; invalid input is reported in the result.
 * @example
 * validateRepeat("hi", 3); // { ok: true }
 * validateRepeat("", 3); // { ok: false, error: "Text cannot be empty." }
 */
export function validateRepeat(text, times) {
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, error: "Text cannot be empty." };
  }
  if (text.length > MAX_REPEAT_LENGTH) {
    return { ok: false, error: `Text is too long (max ${MAX_REPEAT_LENGTH} characters).` };
  }
  if (!Number.isInteger(times) || times < 1) {
    return { ok: false, error: "Times must be a whole number of at least 1." };
  }
  if (times > MAX_REPEAT_TIMES) {
    return { ok: false, error: `Times must be at most ${MAX_REPEAT_TIMES}.` };
  }
  return { ok: true };
}

/**
 * Builds the repeated-text output for the /repeat command after validating
 * the input with validateRepeat.
 *
 * @param {string} text - Text to repeat.
 * @param {number} times - Number of repetitions.
 * @returns {{ ok: true, output: string } | { ok: false, error: string }} The joined output, or the validation error.
 * @throws {never} Never throws; invalid input is reported in the result.
 * @example
 * buildRepeat("hi", 2); // { ok: true, output: "hi\nhi" }
 */
export function buildRepeat(text, times) {
  const check = validateRepeat(text, times);
  if (!check.ok) return check;
  return { ok: true, output: Array(times).fill(text).join("\n") };
}
