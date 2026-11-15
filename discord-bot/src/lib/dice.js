/** Largest number of dice a single roll may request. */
export const MAX_DICE = 25;
/** Largest number of sides a single die may have. */
export const MAX_SIDES = 1000;

/**
 * Parses dice notation of the form "NdN" (e.g. "2d6"), case-insensitive,
 * tolerating surrounding whitespace. Shorthand like "d20" and combined
 * or signed numbers are not supported.
 *
 * @param {string} input - Raw user-supplied dice notation.
 * @returns {{ dice: number, sides: number } | null} Parsed counts, or null when the input is not valid NdN notation.
 * @throws {never} Never throws; invalid notation returns null.
 * @example
 * parseNotation("2d6"); // { dice: 2, sides: 6 }
 * parseNotation("d20"); // null
 */
export function parseNotation(input) {
  if (typeof input !== "string") return null;
  const match = /^(\d+)d(\d+)$/i.exec(input.trim());
  if (!match) return null;
  return { dice: Number(match[1]), sides: Number(match[2]) };
}

/**
 * Rolls `dice` dice, each with `sides` sides, and returns the individual
 * results plus their total. Values are uniformly random in [1, sides].
 *
 * @param {number} dice - Number of dice to roll (callers should validate with isNotationInRange).
 * @param {number} sides - Number of sides per die.
 * @returns {{ rolls: number[], total: number }} Individual rolls and their sum.
 * @throws {never} Pure in-memory computation.
 * @example
 * rollDice(2, 6); // e.g. { rolls: [3, 5], total: 8 }
 */
export function rollDice(dice, sides) {
  /**
   * Produces one uniformly random die face in the inclusive range 1..sides.
   *
   * @returns {number} A random face between 1 and `sides`, inclusive.
   * @throws {never} Uses only Math.random and integer arithmetic.
   * @example
   * // Called once per die by Array.from below.
   */
  const rollOne = () => 1 + Math.floor(Math.random() * sides);

  /**
   * Adds one die result to the running total.
   *
   * @param {number} sum - Accumulated total so far.
   * @param {number} n - The current die result.
   * @returns {number} The updated total.
   * @throws {never} Pure addition.
   * @example
   * [3, 5].reduce(addToTotal, 0); // 8
   */
  const addToTotal = (sum, n) => sum + n;

  const rolls = Array.from({ length: dice }, rollOne);
  const total = rolls.reduce(addToTotal, 0);
  return { rolls, total };
}

/**
 * Formats a roll result into the reply message shown to the user.
 * The total is only included when more than one die was rolled.
 *
 * @param {number} dice - Number of dice rolled.
 * @param {number} sides - Number of sides per die.
 * @param {number[]} rolls - Individual die results.
 * @param {number} total - Sum of all rolls.
 * @returns {string} The formatted reply message.
 * @throws {never} String formatting only.
 * @example
 * formatRollReply(2, 6, [3, 5], 8); // "🎲 Rolled **2d6**: 3, 5 — total **8**"
 */
export function formatRollReply(dice, sides, rolls, total) {
  return `🎲 Rolled **${dice}d${sides}**: ${rolls.join(", ")}${dice > 1 ? ` — total **${total}**` : ""}`;
}

/**
 * Checks whether a parsed notation is within the supported bounds:
 * 1..MAX_DICE dice and 2..MAX_SIDES sides.
 *
 * @param {{ dice: number, sides: number }} notation - A value returned by parseNotation.
 * @returns {boolean} True when both counts are within the supported limits.
 * @throws {never} Pure comparison.
 * @example
 * isNotationInRange({ dice: 2, sides: 6 }); // true
 * isNotationInRange({ dice: 0, sides: 6 }); // false
 */
export function isNotationInRange({ dice, sides }) {
  return dice >= 1 && dice <= MAX_DICE && sides >= 2 && sides <= MAX_SIDES;
}
