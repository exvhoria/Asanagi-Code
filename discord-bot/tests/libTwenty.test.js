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
import { EIGHT_BALL_RESPONSES, flipCoin, pick8BallResponse } from "../src/lib/randomness.js";
import {
  MAX_REPEAT_LENGTH,
  MAX_REPEAT_TIMES,
  buildRepeat,
  recordMessage,
  topChannels,
  totalMessages,
  validateRepeat,
} from "../src/lib/stats.js";

test("dice constants expose the documented limits", () => {
  assert.equal(MAX_DICE, 25);
  assert.equal(MAX_SIDES, 1000);
});

test("parseNotation parses three-digit counts and sides", () => {
  assert.deepEqual(parseNotation("123d456"), { dice: 123, sides: 456 });
});

test("isNotationInRange accepts the minimum side count of two", () => {
  assert.equal(isNotationInRange({ dice: 1, sides: 2 }), true);
});

test("isNotationInRange accepts the maximum dice count with minimum sides", () => {
  assert.equal(isNotationInRange({ dice: MAX_DICE, sides: 2 }), true);
});

test("rollDice at the maximum dice count stays within two-sided bounds", () => {
  const { rolls, total } = rollDice(MAX_DICE, 2);
  assert.equal(rolls.length, MAX_DICE);
  for (const face of rolls) assert.ok(face === 1 || face === 2);
  assert.equal(total, rolls.reduce((sum, n) => sum + n, 0));
});

test("formatRollReply reports a zero total for multi-die rolls", () => {
  assert.equal(formatRollReply(2, 6, [0, 0], 0), "🎲 Rolled **2d6**: 0, 0 — total **0**");
});

test("parseDuration keeps leading zeros before a unit", () => {
  assert.equal(parseDuration("007s"), 7_000);
});

test("parseDuration tolerates a newline before the unit", () => {
  assert.equal(parseDuration("2\nh"), 7_200_000);
});

test("parseDuration rejects a combined multi-part duration", () => {
  assert.equal(parseDuration("1 h 30m"), null);
});

test("parseDuration rejects a leading plus sign", () => {
  assert.equal(parseDuration("+5m"), null);
});

test("formatMs renders one hour as hours", () => {
  assert.equal(formatMs(3_600_000), "1 hour(s)");
});

test("formatMs treats a sub-minute duration as zero days", () => {
  assert.equal(formatMs(1_000), "0 day(s)");
});

test("pick8BallResponse maps the midpoint to the eleventh answer", () => {
  const original = Math.random;
  Math.random = () => 0.5;
  try {
    assert.equal(pick8BallResponse(), EIGHT_BALL_RESPONSES[10]);
  } finally {
    Math.random = original;
  }
});

test("flipCoin maps quarter and three-quarter randoms to their sides", () => {
  const original = Math.random;
  try {
    Math.random = () => 0.25;
    assert.equal(flipCoin(), "Heads");
    Math.random = () => 0.75;
    assert.equal(flipCoin(), "Tails");
  } finally {
    Math.random = original;
  }
});

test("stats constants expose the documented repeat limits", () => {
  assert.equal(MAX_REPEAT_TIMES, 5);
  assert.equal(MAX_REPEAT_LENGTH, 200);
});

test("recordMessage returns and stores successive counts for one channel", () => {
  const counts = {};
  assert.equal(recordMessage(counts, "chan"), 1);
  assert.equal(recordMessage(counts, "chan"), 2);
  assert.equal(recordMessage(counts, "chan"), 3);
  assert.deepEqual(counts, { chan: 3 });
});

test("topChannels orders equal counts by channel id ascending", () => {
  assert.deepEqual(topChannels({ z: 4, a: 4, m: 4 }), [
    { channelId: "a", count: 4 },
    { channelId: "m", count: 4 },
    { channelId: "z", count: 4 },
  ]);
});

test("totalMessages counts only own enumerable channels", () => {
  const counts = Object.create({ inherited: 100 });
  counts.own = 7;
  assert.equal(totalMessages(counts), 7);
});

test("validateRepeat rejects whitespace with a newline", () => {
  assert.deepEqual(validateRepeat(" \n\t ", 2), {
    ok: false,
    error: "Text cannot be empty.",
  });
});

test("buildRepeat forwards the below-minimum times error", () => {
  assert.deepEqual(buildRepeat("hi", 0), {
    ok: false,
    error: "Times must be a whole number of at least 1.",
  });
});
