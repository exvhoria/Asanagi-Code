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

test("parseNotation accepts standard NdN notation", () => {
  assert.deepEqual(parseNotation("2d6"), { dice: 2, sides: 6 });
  assert.deepEqual(parseNotation("4d20"), { dice: 4, sides: 20 });
  assert.deepEqual(parseNotation("1d1"), { dice: 1, sides: 1 });
  assert.deepEqual(parseNotation("25d1000"), { dice: 25, sides: 1000 });
});

test("parseNotation trims surrounding whitespace", () => {
  assert.deepEqual(parseNotation("  3d10  "), { dice: 3, sides: 10 });
  assert.deepEqual(parseNotation("\t2d6\n"), { dice: 2, sides: 6 });
});

test("parseNotation is case-insensitive for the d separator", () => {
  assert.deepEqual(parseNotation("2D6"), { dice: 2, sides: 6 });
  // a doubled separator is not valid NdN — only a single d/D between the numbers
  assert.equal(parseNotation("2dD6"), null);
});

test("parseNotation rejects non-NdN input", () => {
  assert.equal(parseNotation(""), null);
  assert.equal(parseNotation("   "), null);
  assert.equal(parseNotation("d6"), null);
  assert.equal(parseNotation("2d"), null);
  assert.equal(parseNotation("2"), null);
  assert.equal(parseNotation("-1d6"), null);
  assert.equal(parseNotation("2.5d6"), null);
  assert.equal(parseNotation("2d-6"), null);
  assert.equal(parseNotation("2x6"), null);
  assert.equal(parseNotation("2d6x"), null);
  assert.equal(parseNotation("roll 2d6"), null);
  assert.equal(parseNotation("2dd6"), null);
});

test("isNotationInRange enforces dice and side limits", () => {
  assert.equal(isNotationInRange({ dice: 1, sides: 2 }), true);
  assert.equal(isNotationInRange({ dice: MAX_DICE, sides: MAX_SIDES }), true);
  assert.equal(isNotationInRange({ dice: 0, sides: 6 }), false);
  assert.equal(isNotationInRange({ dice: MAX_DICE + 1, sides: 6 }), false);
  assert.equal(isNotationInRange({ dice: 2, sides: 1 }), false);
  assert.equal(isNotationInRange({ dice: 2, sides: MAX_SIDES + 1 }), false);
});

test("rollDice returns the requested number of dice within bounds", () => {
  for (let trial = 0; trial < 100; trial++) {
    const { rolls, total } = rollDice(7, 6);
    assert.equal(rolls.length, 7);
    for (const value of rolls) {
      assert.ok(Number.isInteger(value), "each roll is an integer");
      assert.ok(value >= 1 && value <= 6, `roll ${value} is within 1..6`);
    }
    assert.equal(total, rolls.reduce((sum, n) => sum + n, 0));
  }
});

test("rollDice covers both ends of the range over many rolls", () => {
  const seen = new Set();
  for (let trial = 0; trial < 5000; trial++) {
    seen.add(rollDice(1, 2).rolls[0]);
  }
  assert.deepEqual([...seen].sort(), [1, 2]);
});

test("rollDice with zero dice gives an empty roll list and total 0", () => {
  assert.deepEqual(rollDice(0, 6), { rolls: [], total: 0 });
});

test("formatRollReply matches the command's message shape", () => {
  assert.equal(formatRollReply(3, 6, [2, 5, 6], 13), "🎲 Rolled **3d6**: 2, 5, 6 — total **13**");
  assert.equal(formatRollReply(1, 20, [7], 7), "🎲 Rolled **1d20**: 7");
});
