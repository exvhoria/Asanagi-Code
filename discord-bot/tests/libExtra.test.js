import test from "node:test";
import assert from "node:assert/strict";
import { MAX_DICE, MAX_SIDES, formatRollReply, isNotationInRange, parseNotation, rollDice } from "../src/lib/dice.js";
import { MAX_DURATION_MS, formatMs, parseDuration } from "../src/lib/duration.js";
import { EIGHT_BALL_RESPONSES } from "../src/lib/randomness.js";
import { MAX_REPEAT_LENGTH, MAX_REPEAT_TIMES, buildRepeat, recordMessage, topChannels, totalMessages, validateRepeat } from "../src/lib/stats.js";

test("parseNotation returns numeric fields, not strings", () => {
  const notation = parseNotation("2d6");
  assert.equal(typeof notation.dice, "number");
  assert.equal(typeof notation.sides, "number");
});

test("isNotationInRange rejects negative dice and sides", () => {
  assert.equal(isNotationInRange({ dice: -1, sides: 6 }), false);
  assert.equal(isNotationInRange({ dice: 1, sides: -6 }), false);
});

test("isNotationInRange accepts the maximum supported combination", () => {
  assert.equal(isNotationInRange({ dice: MAX_DICE, sides: MAX_SIDES }), true);
});

test("rollDice with a single one-sided die always rolls a one", () => {
  assert.deepEqual(rollDice(1, 1), { rolls: [1], total: 1 });
});

test("rollDice at the max bounds returns 25 in-bounds dice with a matching total", () => {
  const { rolls, total } = rollDice(MAX_DICE, MAX_SIDES);
  assert.equal(rolls.length, MAX_DICE);
  for (const face of rolls) assert.ok(face >= 1 && face <= MAX_SIDES);
  assert.equal(total, rolls.reduce((sum, n) => sum + n, 0));
});

test("rollDice with one die makes the total equal the single roll", () => {
  for (let trial = 0; trial < 100; trial++) {
    const { rolls, total } = rollDice(1, 6);
    assert.equal(rolls.length, 1);
    assert.equal(total, rolls[0]);
  }
});

test("formatRollReply omits the total for zero dice", () => {
  assert.equal(formatRollReply(0, 6, [], 0), "🎲 Rolled **0d6**: ");
});

test("formatRollReply embeds the exact NdN notation in bold", () => {
  assert.ok(formatRollReply(2, 20, [3, 5], 8).includes("**2d20**"));
  assert.ok(formatRollReply(1, 100, [50], 50).includes("**1d100**"));
});

test("parseDuration unit equivalence: hours equal their minutes", () => {
  assert.equal(parseDuration("1h"), parseDuration("60m"));
  assert.equal(parseDuration("2h"), parseDuration("120m"));
});

test("parseDuration converts seconds and minutes up to days correctly", () => {
  assert.equal(parseDuration("7200s"), 7_200_000);
  assert.equal(parseDuration("10_080m"), null);
  assert.equal(parseDuration("10080m"), MAX_DURATION_MS);
});

test("parseDuration one week equals the seven-day maximum exactly", () => {
  assert.equal(parseDuration("1w"), MAX_DURATION_MS);
  assert.equal(parseDuration("7d"), parseDuration("1w"));
});

test("formatMs renders the seven-day maximum as days", () => {
  assert.equal(formatMs(MAX_DURATION_MS), "7 day(s)");
});

test("formatMs keeps 73 hours as hours rather than promoting to days", () => {
  assert.equal(formatMs(73 * 3_600_000), "73 hour(s)");
});

test("formatMs keeps 45 minutes as minutes", () => {
  assert.equal(formatMs(45 * 60_000), "45 minute(s)");
});

test("EIGHT_BALL_RESPONSES keeps its canonical first and last answers, uppercase with no newlines", () => {
  assert.equal(EIGHT_BALL_RESPONSES[0], "It is certain.");
  assert.equal(EIGHT_BALL_RESPONSES[EIGHT_BALL_RESPONSES.length - 1], "Very doubtful.");
  for (const response of EIGHT_BALL_RESPONSES) {
    assert.ok(!response.includes("\n"));
    assert.ok(response[0] === response[0].toUpperCase());
  }
});

test("recordMessage keeps three channels independent of each other", () => {
  const counts = {};
  recordMessage(counts, "a");
  recordMessage(counts, "b");
  recordMessage(counts, "a");
  recordMessage(counts, "c");
  assert.deepEqual(counts, { a: 2, b: 1, c: 1 });
});

test("topChannels does not mutate the input counts object", () => {
  const counts = { a: 1, b: 2 };
  const snapshot = { ...counts };
  topChannels(counts);
  assert.deepEqual(counts, snapshot);
});

test("totalMessages matches the sum of topChannels counts and handles one channel", () => {
  const counts = { a: 5, b: 7, c: 3 };
  const top = topChannels(counts);
  assert.equal(totalMessages(counts), top.reduce((sum, entry) => sum + entry.count, 0));
  assert.equal(totalMessages({ only: 4 }), 4);
});

test("validateRepeat reports all four exact error messages", () => {
  assert.deepEqual(validateRepeat("  \n", 1), { ok: false, error: "Text cannot be empty." });
  assert.deepEqual(validateRepeat("a".repeat(MAX_REPEAT_LENGTH + 1), 1), {
    ok: false,
    error: "Text is too long (max 200 characters).",
  });
  assert.deepEqual(validateRepeat("hi", 0.5), {
    ok: false,
    error: "Times must be a whole number of at least 1.",
  });
  assert.deepEqual(validateRepeat("hi", MAX_REPEAT_TIMES + 1), {
    ok: false,
    error: "Times must be at most 5.",
  });
});

test("validateRepeat rejects string times and buildRepeat counts its newlines exactly", () => {
  assert.equal(validateRepeat("hi", "3").ok, false);
  const result = buildRepeat("ab", 4);
  assert.equal(result.ok, true);
  assert.equal(result.output, "ab\nab\nab\nab");
  assert.equal(result.output.split("\n").length - 1, 3);
});
