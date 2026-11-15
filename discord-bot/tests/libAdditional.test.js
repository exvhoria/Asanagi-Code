import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DICE,
  MAX_SIDES,
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
} from "../src/lib/stats.js";

test("parseNotation rejects line breaks inside the notation", () => {
  assert.equal(parseNotation("2\nd6"), null);
  assert.equal(parseNotation("2d\n6"), null);
});

test("isNotationInRange accepts both boundary corners of the supported box", () => {
  assert.equal(isNotationInRange({ dice: 1, sides: MAX_SIDES }), true);
  assert.equal(isNotationInRange({ dice: MAX_DICE, sides: 2 }), true);
});

test("isNotationInRange rejects counts just outside the limits", () => {
  assert.equal(isNotationInRange({ dice: MAX_DICE + 0.5, sides: 6 }), false);
  assert.equal(isNotationInRange({ dice: 2, sides: MAX_SIDES + 0.5 }), false);
});

test("rollDice returns a fresh rolls array on every call", () => {
  const first = rollDice(3, 6).rolls;
  const second = rollDice(3, 6).rolls;
  assert.notEqual(first, second);
});

test("rollDice maps Math.random()=0 to every lowest face", () => {
  const original = Math.random;
  Math.random = () => 0;
  try {
    assert.deepEqual(rollDice(4, 6), { rolls: [1, 1, 1, 1], total: 4 });
  } finally {
    Math.random = original;
  }
});

test("rollDice maps Math.random() near 1 to every highest face", () => {
  const original = Math.random;
  Math.random = () => 0.999999;
  try {
    assert.deepEqual(rollDice(3, 20), {
      rolls: [20, 20, 20],
      total: 60,
    });
  } finally {
    Math.random = original;
  }
});

test("parseDuration converts one second and one minute exactly", () => {
  assert.equal(parseDuration("1s"), 1_000);
  assert.equal(parseDuration("1m"), 60_000);
});

test("parseDuration accepts a space before day and week units", () => {
  assert.equal(parseDuration("1 d"), 86_400_000);
  assert.equal(parseDuration("1 w"), 604_800_000);
});

test("parseDuration rejects a unit with no number", () => {
  assert.equal(parseDuration(" s"), null);
  assert.equal(parseDuration("d"), null);
  assert.equal(parseDuration("w"), null);
});

test("formatMs renders a whole hour as hours", () => {
  assert.equal(formatMs(60 * 60_000), "1 hour(s)");
});

test("formatMs keeps 1439 minutes as minutes rather than promoting to a day", () => {
  assert.equal(formatMs(1439 * 60_000), "1439 minute(s)");
});

test("formatMs promotes exact multiples of a day", () => {
  assert.equal(formatMs(1440 * 60_000), "1 day(s)");
  assert.equal(formatMs(2880 * 60_000), "2 day(s)");
});

test("flipCoin returns a primitive string", () => {
  assert.equal(typeof flipCoin(), "string");
});

test("pick8BallResponse always ends with a period", () => {
  for (let trial = 0; trial < 200; trial++) {
    assert.ok(pick8BallResponse().endsWith("."));
  }
});

test("the 8-ball pool contains representative answers", () => {
  assert.ok(EIGHT_BALL_RESPONSES.includes("Yes."));
  assert.ok(EIGHT_BALL_RESPONSES.includes("My reply is no."));
});

test("every 8-ball answer has no leading or trailing whitespace", () => {
  for (const response of EIGHT_BALL_RESPONSES) {
    assert.equal(response, response.trim());
  }
});

test("recordMessage starts a brand-new channel at one", () => {
  const counts = {};
  assert.equal(recordMessage(counts, "fresh"), 1);
  assert.deepEqual(counts, { fresh: 1 });
});

test("recordMessage increments an existing stored count", () => {
  const counts = { existing: 41 };
  assert.equal(recordMessage(counts, "existing"), 42);
  assert.equal(counts.existing, 42);
});

test("topChannels floors a fractional limit", () => {
  assert.deepEqual(topChannels({ a: 1, b: 2, c: 3 }, 2.9), [
    { channelId: "c", count: 3 },
    { channelId: "b", count: 2 },
  ]);
});

test("buildRepeat at the maximum produces times minus one newline separators", () => {
  const result = buildRepeat("x", MAX_REPEAT_TIMES);
  assert.equal(result.ok, true);
  assert.equal(result.output.split("\n").length, MAX_REPEAT_TIMES);
  assert.equal(result.output.split("\n").length - 1, MAX_REPEAT_TIMES - 1);
});
