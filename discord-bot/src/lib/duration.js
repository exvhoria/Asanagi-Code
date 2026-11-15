/** Upper bound for durations accepted by commands, in milliseconds (seven days). */
export const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Parses a duration string of the form "<number><unit?>" where the optional
 * unit is one of s, m, h, d, w (case-insensitive, whitespace tolerated).
 * A bare number defaults to minutes. Combined units like "1h30m", floats,
 * and negative values are not supported. Note that "0" parses to 0, which
 * is falsy and therefore rejected downstream.
 *
 * @param {string} input - Raw user-supplied duration string.
 * @returns {number | null} Duration in milliseconds, or null when the input is invalid.
 * @throws {never} Never throws; unparseable input returns null.
 * @example
 * parseDuration("90m"); // 5400000
 */
export function parseDuration(input) {
  if (typeof input !== "string") return null;
  const match = /^(\d+)\s*([smhdw]?)$/i.exec(input.trim());
  if (!match) return null;
  const unit = (match[2] ?? "").toLowerCase();
  const unitMs = { "": 60_000, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[unit];
  return Number(match[1]) * unitMs;
}

/**
 * Renders a duration in the coarsest sensible unit: whole days, otherwise
 * whole hours, otherwise minutes (rounded). Values are not combined, so
 * e.g. 90 minutes renders as "90 minute(s)", not "1 hour(s) 30 minute(s)".
 *
 * @param {number} ms - Duration in milliseconds.
 * @returns {string} Human-readable description such as "2 hour(s)".
 * @throws {never} Pure arithmetic on numbers.
 * @example
 * formatMs(7200000); // "2 hour(s)"
 */
export function formatMs(ms) {
  const minutes = Math.round(ms / 60_000);
  if (minutes % 1440 === 0) return `${minutes / 1440} day(s)`;
  if (minutes % 60 === 0) return `${minutes / 60} hour(s)`;
  return `${minutes} minute(s)`;
}
