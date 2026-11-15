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
import {
  EIGHT_BALL_RESPONSES,
  flipCoin,
  pick8BallResponse,
} from "../src/lib/randomness.js";
import {
  MAX_REPEAT_TIMES,
  buildRepeat,
  recordMessage,
  topChannels,
  totalMessages,
  validateRepeat,
} from "../src/lib/stats.js";

test("parseNotation returns null for non-string inputs", () => {
  assert.equal(parseNotation(42), null);
  assert.equal(parseNotation(null), null);
  assert.equal(parseNotation(undefined), null);
  assert.equal(parseNotation({}), null);
  assert.equal(parseNotation(["2d6"]), null);
});

test("parseNotation rejects non-ASCII digit lookalikes", () => {
  assert.equal(parseNotation("٢d٦"), null);
  assert.equal(parseNotation("2d６"), null);
});

test("parseNotation accepts trailing tabs after the notation", () => {
  assert.deepEqual(parseNotation("2d6\t"), { dice: 2, sides: 6 });
  assert.deepEqual(parseNotation("\n10d20 "), { dice: 10, sides: 20 });
});

test("isNotationInRange rejects counts just above each maximum", () => {
  assert.equal(isNotationInRange({ dice: MAX_DICE + 0.0001, sides: 6 }), false);
  assert.equal(isNotationInRange({ dice: 2, sides: MAX_SIDES + 0.0001 }), false);
});

test("rollDice calls Math.random exactly once per die", () => {
  const original = Math.random;
  let calls = 0;
  Math.random = () => {
    calls++;
    return 0.5;
  };
  try {
    rollDice(5, 6);
    assert.equal(calls, 5);
    calls = 0;
    rollDice(0, 6);
    assert.equal(calls, 0);
  } finally {
    Math.random = original;
  }
});

test("rollDice interprets a scripted random sequence in order", () => {
  const original = Math.random;
  const values = [0, 0.999, 0.5];
  let index = 0;
  Math.random = () => values[index++];
  try {
    assert.deepEqual(rollDice(3, 2), { rolls: [1, 2, 2], total: 5 });
  } finally {
    Math.random = original;
  }
});

test("formatRollReply includes a total only for multi-die rolls", () => {
  assert.equal(formatRollReply(2, 6, [1, 6], 7), "🎲 Rolled **2d6**: 1, 6 — total **7**");
  assert.equal(formatRollReply(1, 6, [6], 6), "🎲 Rolled **1d6**: 6");
});

test("parseDuration returns null for non-string inputs", () => {
  assert.equal(parseDuration(30), null);
  assert.equal(parseDuration(null), null);
  assert.equal(parseDuration(undefined), null);
  assert.equal(parseDuration({}), null);
});

test("parseDuration rejects unsupported units", () => {
  assert.equal(parseDuration("1y"), null);
  assert.equal(parseDuration("1mo"), null);
  assert.equal(parseDuration("1ms"), null);
  assert.equal(parseDuration("1M "), 60_000, "M is minutes, not months");
});

test("parseDuration tolerates a tab between number and week unit", () => {
  assert.equal(parseDuration("1\tw"), 604_800_000);
});

test("formatMs never combines days with leftover minutes", () => {
  assert.equal(formatMs(1441 * 60_000), "1441 minute(s)");
  assert.equal(formatMs(90 * 60_000), "90 minute(s)");
});

test("formatMs rounds up to the next whole minute just past a day boundary", () => {
  assert.equal(formatMs(7 * 86_400_000 + 60_000), "10081 minute(s)");
});

test("pick8BallResponse maps the random extremes to the pool ends", () => {
  const original = Math.random;
  try {
    Math.random = () => 0;
    assert.equal(pick8BallResponse(), EIGHT_BALL_RESPONSES[0]);
    Math.random = () => 0.999999;
    assert.equal(
      pick8BallResponse(),
      EIGHT_BALL_RESPONSES[EIGHT_BALL_RESPONSES.length - 1]
    );
  } finally {
    Math.random = original;
  }
});

test("flipCoin maps the random extremes and the midpoint as documented", () => {
  const original = Math.random;
  try {
    Math.random = () => 0;
    assert.equal(flipCoin(), "Heads");
    Math.random = () => 0.499999;
    assert.equal(flipCoin(), "Heads");
    Math.random = () => 0.5;
    assert.equal(flipCoin(), "Tails");
  } finally {
    Math.random = original;
  }
});

test("recordMessage treats a stored zero as a fresh count", () => {
  const counts = { zero: 0 };
  assert.equal(recordMessage(counts, "zero"), 1);
  assert.deepEqual(counts, { zero: 1 });
});

test("topChannels with an infinite limit returns every entry sorted", () => {
  assert.deepEqual(topChannels({ a: 1, b: 3, c: 2 }, Number.POSITIVE_INFINITY), [
    { channelId: "b", count: 3 },
    { channelId: "c", count: 2 },
    { channelId: "a", count: 1 },
  ]);
});

test("topChannels with a NaN limit returns no entries", () => {
  assert.deepEqual(topChannels({ a: 1, b: 2 }, Number.NaN), []);
});

test("totalMessages sums negative and mixed counts arithmetically", () => {
  assert.equal(totalMessages({ a: 5, b: -2, c: 0 }), 3);
  assert.equal(totalMessages({ a: -1, b: -1 }), -2);
});

test("validateRepeat rejects non-string text and boolean counts", () => {
  assert.deepEqual(validateRepeat(null, 1), {
    ok: false,
    error: "Text cannot be empty.",
  });
  assert.deepEqual(validateRepeat(undefined, 1), {
    ok: false,
    error: "Text cannot be empty.",
  });
  assert.equal(validateRepeat("hi", true).ok, false);
});

test("buildRepeat fills exactly MAX_REPEAT_TIMES copies at the limit", () => {
  const result = buildRepeat("hi", MAX_REPEAT_TIMES);
  assert.equal(result.ok, true);
  assert.equal(result.output, Array(MAX_REPEAT_TIMES).fill("hi").join("\n"));
  assert.equal(result.output.match(/hi/g).length, MAX_REPEAT_TIMES);
});
