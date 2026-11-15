import test from "node:test";
import assert from "node:assert/strict";
import { MAX_DICE, MAX_SIDES, formatRollReply, isNotationInRange, parseNotation, rollDice } from "../src/lib/dice.js";

test("parseNotation accepts '0d6' (parsed, but out of range downstream)", () => {
  assert.deepEqual(parseNotation("0d6"), { dice: 0, sides: 6 });
  assert.equal(isNotationInRange({ dice: 0, sides: 6 }), false);
});

test("parseNotation accepts a huge count like 1000 dice (out of range downstream)", () => {
  assert.deepEqual(parseNotation("1000d6"), { dice: 1000, sides: 6 });
  assert.equal(isNotationInRange({ dice: 1000, sides: 6 }), false);
  assert.equal(isNotationInRange({ dice: MAX_DICE + 1, sides: 6 }), false);
});

test("parseNotation rejects the 'd20' shorthand", () => {
  assert.equal(parseNotation("d20"), null);
  assert.equal(parseNotation("D20"), null);
});

test("parseNotation accepts '6d2' — count and sides are position-independent", () => {
  assert.deepEqual(parseNotation("6d2"), { dice: 6, sides: 2 });
});

test("parseNotation keeps leading zeros as plain decimal", () => {
  assert.deepEqual(parseNotation("0002d06"), { dice: 2, sides: 6 });
  assert.deepEqual(parseNotation("01d0999"), { dice: 1, sides: 999 });
});

test("parseNotation rejects a signed count", () => {
  assert.equal(parseNotation("+2d6"), null);
  assert.equal(parseNotation("−1d6"), null, "a unicode minus is still not a valid count");
});

test("parseNotation rejects whitespace between count, separator, and sides", () => {
  assert.equal(parseNotation("2 d6"), null);
  assert.equal(parseNotation("2d 6"), null);
});

test("parseNotation parses very large numeric input without crashing, then range-rejects it", () => {
  const parsed = parseNotation("99999999999999999999d6");
  assert.ok(parsed, "a 20-digit count still matches the NdN shape");
  assert.equal(parsed.dice, 100000000000000000000);
  assert.equal(isNotationInRange(parsed), false);
});

test("parseNotation rejects non-ASCII lookalike separators", () => {
  assert.equal(parseNotation("2ᴅ6"), null);
  assert.equal(parseNotation("2dー6"), null);
});

test("parseNotation rejects other separators and mixed words", () => {
  assert.equal(parseNotation("2-d6"), null);
  assert.equal(parseNotation("2/d6"), null);
  assert.equal(parseNotation("d2d6"), null);
});

test("rollDice(1000, 6) produces 1000 in-bounds rolls with a correct total", () => {
  const { rolls, total } = rollDice(1000, 6);
  assert.equal(rolls.length, 1000);
  for (const value of rolls) {
    assert.ok(value >= 1 && value <= 6);
  }
  assert.equal(total, rolls.reduce((sum, n) => sum + n, 0));
});

test("rollDice(0, 1000) is still a valid empty roll", () => {
  assert.deepEqual(rollDice(0, 1000), { rolls: [], total: 0 });
});

test("formatRollReply handles a huge sides value without changing shape", () => {
  assert.equal(
    formatRollReply(1, MAX_SIDES, [MAX_SIDES], MAX_SIDES),
    `🎲 Rolled **1d${MAX_SIDES}**: ${MAX_SIDES}`
  );
});
