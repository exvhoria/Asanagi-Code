import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DICE,
  MAX_SIDES,
  formatRollReply,
  isNotationInRange,
  parseNotation,
  rollDice,
} from "../src/lib/dice.js";
import { formatMs, parseDuration } from "../src/lib/duration.js";
import { EIGHT_BALL_RESPONSES } from "../src/lib/randomness.js";
import {
  MAX_REPEAT_LENGTH,
  MAX_REPEAT_TIMES,
  buildRepeat,
  topChannels,
  totalMessages,
  validateRepeat,
} from "../src/lib/stats.js";

test("parseNotation is case-insensitive", () => {
  assert.deepEqual(parseNotation("2D6"), { dice: 2, sides: 6 });
  assert.deepEqual(parseNotation("3d8"), { dice: 3, sides: 8 });
});

test("parseNotation trims surrounding whitespace", () => {
  assert.deepEqual(parseNotation("  4d10  "), { dice: 4, sides: 10 });
});

test("parseNotation rejects empty and whitespace-only input", () => {
  assert.equal(parseNotation(""), null);
  assert.equal(parseNotation("   \t\n"), null);
});

test("parseNotation rejects decimal, signed, and combined notation", () => {
  assert.equal(parseNotation("1.5d6"), null);
  assert.equal(parseNotation("-1d6"), null);
  assert.equal(parseNotation("+1d6"), null);
  assert.equal(parseNotation("2d6+1"), null);
});

test("parseNotation keeps out-of-range values for the range check to reject", () => {
  assert.deepEqual(parseNotation("0d6"), { dice: 0, sides: 6 });
  assert.equal(isNotationInRange(parseNotation("0d6")), false);
});

test("isNotationInRange rejects side counts outside 2..MAX_SIDES", () => {
  assert.equal(isNotationInRange({ dice: 1, sides: 1 }), false);
  assert.equal(isNotationInRange({ dice: 1, sides: MAX_SIDES + 1 }), false);
});

test("isNotationInRange rejects dice counts above MAX_DICE", () => {
  assert.equal(isNotationInRange({ dice: MAX_DICE + 1, sides: 6 }), false);
});

test("rollDice returns exactly the requested number of dice", () => {
  const { rolls } = rollDice(7, 6);
  assert.equal(rolls.length, 7);
});

test("rollDice keeps every face within 1..sides", () => {
  const { rolls } = rollDice(20, 12);
  for (const face of rolls) {
    assert.ok(face >= 1 && face <= 12, `face ${face} out of range`);
  }
});

test("rollDice with zero dice returns an empty roll and zero total", () => {
  assert.deepEqual(rollDice(0, 6), { rolls: [], total: 0 });
});

test("formatRollReply omits the total for a single die", () => {
  assert.equal(formatRollReply(1, 20, [7], 7), "🎲 Rolled **1d20**: 7");
});

test("formatRollReply includes the total for multiple dice", () => {
  assert.equal(formatRollReply(3, 4, [2, 4, 1], 7), "🎲 Rolled **3d4**: 2, 4, 1 — total **7**");
});

test("parseDuration treats a bare number as minutes", () => {
  assert.equal(parseDuration("5"), 300_000);
  assert.equal(parseDuration("0"), 0);
});

test("parseDuration accepts uppercase unit letters", () => {
  assert.equal(parseDuration("2H"), 7_200_000);
  assert.equal(parseDuration("1W"), 604_800_000);
});

test("parseDuration rejects combined units", () => {
  assert.equal(parseDuration("1h30m"), null);
  assert.equal(parseDuration("1d2h"), null);
});

test("parseDuration rejects negative and fractional values", () => {
  assert.equal(parseDuration("-5m"), null);
  assert.equal(parseDuration("1.5h"), null);
});

test("parseDuration rejects blank input", () => {
  assert.equal(parseDuration(""), null);
  assert.equal(parseDuration("   "), null);
});

test("formatMs documents zero as zero days", () => {
  assert.equal(formatMs(0), "0 day(s)");
});

test("formatMs rounds sub-minute values up to one minute", () => {
  assert.equal(formatMs(30_000), "1 minute(s)");
  assert.equal(formatMs(60_000), "1 minute(s)");
});

test("formatMs promotes exact whole days", () => {
  assert.equal(formatMs(86_400_000), "1 day(s)");
  assert.equal(formatMs(7 * 86_400_000), "7 day(s)");
});

test("EIGHT_BALL_RESPONSES contains twenty unique answers", () => {
  assert.equal(EIGHT_BALL_RESPONSES.length, 20);
  assert.equal(new Set(EIGHT_BALL_RESPONSES).size, 20);
});

test("every 8-ball answer is a complete sentence ending with a period", () => {
  for (const response of EIGHT_BALL_RESPONSES) {
    assert.ok(response.endsWith("."), `missing period: ${response}`);
    assert.ok(response.length > 1);
  }
});

test("topChannels with a zero limit returns no channels", () => {
  assert.deepEqual(topChannels({ a: 1, b: 2 }, 0), []);
});

test("topChannels with a limit above the entry count returns every entry sorted", () => {
  assert.deepEqual(topChannels({ a: 1, b: 3, c: 2 }, 50), [
    { channelId: "b", count: 3 },
    { channelId: "c", count: 2 },
    { channelId: "a", count: 1 },
  ]);
});

test("validateRepeat rejects whitespace-only text", () => {
  assert.equal(validateRepeat("   \t", 2).ok, false);
});

test("validateRepeat rejects repeat counts below one", () => {
  assert.equal(validateRepeat("hi", 0).ok, false);
  assert.equal(validateRepeat("hi", -2).ok, false);
});

test("validateRepeat accepts both limits exactly", () => {
  assert.deepEqual(validateRepeat("a".repeat(MAX_REPEAT_LENGTH), MAX_REPEAT_TIMES), { ok: true });
});

test("buildRepeat returns a single repetition unchanged", () => {
  assert.deepEqual(buildRepeat("x", 1), { ok: true, output: "x" });
});

test("buildRepeat forwards the too-many-repetitions error", () => {
  assert.deepEqual(buildRepeat("x", MAX_REPEAT_TIMES + 1), {
    ok: false,
    error: `Times must be at most ${MAX_REPEAT_TIMES}.`,
  });
});

test("totalMessages returns zero for an empty map", () => {
  assert.equal(totalMessages({}), 0);
});
