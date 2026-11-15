import test from "node:test";
import assert from "node:assert/strict";
import { MAX_DICE, MAX_SIDES, formatRollReply, isNotationInRange, parseNotation, rollDice } from "../src/lib/dice.js";
import { MAX_DURATION_MS, formatMs, parseDuration } from "../src/lib/duration.js";
import { EIGHT_BALL_RESPONSES, flipCoin, pick8BallResponse } from "../src/lib/randomness.js";
import { MAX_REPEAT_LENGTH, MAX_REPEAT_TIMES, buildRepeat, recordMessage, topChannels, totalMessages, validateRepeat } from "../src/lib/stats.js";

test("rollDice with one-sided dice always rolls ones", () => {
  assert.deepEqual(rollDice(3, 1), { rolls: [1, 1, 1], total: 3 });
});

test("rollDice totals always stay within the theoretical bounds", () => {
  for (let trial = 0; trial < 200; trial++) {
    const { rolls, total } = rollDice(5, 8);
    assert.ok(total >= 5 && total <= 40);
    assert.equal(total, rolls.reduce((sum, n) => sum + n, 0));
  }
});

test("formatRollReply omits the total for a single die even when it is given", () => {
  assert.equal(formatRollReply(1, 6, [4], 100), "🎲 Rolled **1d6**: 4");
});

test("formatRollReply separates multiple rolls with a comma and a space", () => {
  assert.equal(formatRollReply(4, 2, [1, 2, 1, 2], 6), "🎲 Rolled **4d2**: 1, 2, 1, 2 — total **6**");
});

test("isNotationInRange accepts the exact boundary combinations", () => {
  assert.equal(isNotationInRange({ dice: 1, sides: MAX_SIDES }), true);
  assert.equal(isNotationInRange({ dice: MAX_DICE, sides: 2 }), true);
});

test("parseNotation does not accept surrounding words or internal spaces", () => {
  assert.equal(parseNotation("roll 1d20 please"), null);
  assert.equal(parseNotation("1 d20"), null);
});

test("parseDuration tolerates tabs and newlines around and inside a duration", () => {
  assert.equal(parseDuration("\t5m\n"), 300_000);
  assert.equal(parseDuration("5\tm"), 300_000);
  assert.equal(parseDuration("2\nh"), 7_200_000);
});

test("parseDuration parses every unit as the correct number of milliseconds", () => {
  assert.equal(parseDuration("3s"), 3_000);
  assert.equal(parseDuration("3m"), 180_000);
  assert.equal(parseDuration("3h"), 10_800_000);
  assert.equal(parseDuration("3d"), 259_200_000);
  assert.equal(parseDuration("3w"), 1_814_400_000);
});

test("parseDuration two weeks exceeds the seven-day maximum", () => {
  assert.ok(parseDuration("2w") > MAX_DURATION_MS);
  assert.equal(parseDuration("7d"), MAX_DURATION_MS);
});

test("formatMs rounds to the nearest minute", () => {
  assert.equal(formatMs(89_999), "1 minute(s)");
  assert.equal(formatMs(90_000), "2 minute(s)");
});

test("formatMs keeps 59 minutes as minutes rather than promoting to hours", () => {
  assert.equal(formatMs(59 * 60_000), "59 minute(s)");
});

test("formatMs keeps 25 hours as hours rather than promoting to days", () => {
  assert.equal(formatMs(25 * 3_600_000), "25 hour(s)");
});

test("formatMs promotes exact multiples of 48 hours to days", () => {
  assert.equal(formatMs(48 * 3_600_000), "2 day(s)");
});

test("EIGHT_BALL_RESPONSES entries are all non-empty strings", () => {
  for (const response of EIGHT_BALL_RESPONSES) {
    assert.equal(typeof response, "string");
    assert.ok(response.trim().length > 0);
  }
});

test("pick8BallResponse always returns a string from the pool", () => {
  for (let trial = 0; trial < 500; trial++) {
    const response = pick8BallResponse();
    assert.equal(typeof response, "string");
    assert.ok(EIGHT_BALL_RESPONSES.includes(response));
  }
});

test("flipCoin returns only the documented sides", () => {
  const allowed = new Set(["Heads", "Tails"]);
  for (let trial = 0; trial < 1000; trial++) {
    assert.ok(allowed.has(flipCoin()));
  }
});

test("recordMessage mutates the original counts object", () => {
  const counts = {};
  recordMessage(counts, "chan-a");
  recordMessage(counts, "chan-a");
  assert.deepEqual(counts, { "chan-a": 2 });
});

test("topChannels defaults to a limit of ten", () => {
  const counts = {};
  for (let i = 1; i <= 12; i++) counts[`chan-${i}`] = i;
  const result = topChannels(counts);
  assert.equal(result.length, 10);
  assert.deepEqual(result[0], { channelId: "chan-12", count: 12 });
  assert.deepEqual(result[9], { channelId: "chan-3", count: 3 });
});

test("topChannels breaks ties by channel id ascending", () => {
  assert.deepEqual(topChannels({ b: 2, a: 2, c: 2 }), [
    { channelId: "a", count: 2 },
    { channelId: "b", count: 2 },
    { channelId: "c", count: 2 },
  ]);
});

test("totalMessages sums many channels and handles zero counts", () => {
  assert.equal(totalMessages({ a: 10, b: 20, c: 30 }), 60);
  assert.equal(totalMessages({ a: 0, b: 0 }), 0);
});

test("buildRepeat preserves surrounding whitespace in the repeated text", () => {
  assert.deepEqual(buildRepeat(" hi ", 2), { ok: true, output: " hi \n hi " });
});

test("validateRepeat accepts text at exactly the length limit", () => {
  assert.deepEqual(validateRepeat("a".repeat(MAX_REPEAT_LENGTH), MAX_REPEAT_TIMES), { ok: true });
});

test("validateRepeat rejects non-finite and non-integer repeat counts", () => {
  assert.equal(validateRepeat("hi", Number.NaN).ok, false);
  assert.equal(validateRepeat("hi", Number.POSITIVE_INFINITY).ok, false);
  assert.equal(validateRepeat("hi", 2.25).ok, false);
});
