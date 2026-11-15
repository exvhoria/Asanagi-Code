import test from "node:test";
import assert from "node:assert/strict";
import {
  EIGHT_BALL_RESPONSES,
  flipCoin,
  pick8BallResponse,
} from "../src/lib/randomness.js";
import { rollDice } from "../src/lib/dice.js";

test("flipCoin only ever returns Heads or Tails", () => {
  for (let trial = 0; trial < 2000; trial++) {
    const result = flipCoin();
    assert.ok(result === "Heads" || result === "Tails", `got ${result}`);
  }
});

test("flipCoin produces both outcomes over many flips", () => {
  const seen = new Set();
  for (let trial = 0; trial < 5000; trial++) seen.add(flipCoin());
  assert.deepEqual([...seen].sort(), ["Heads", "Tails"]);
});

test("flipCoin is roughly balanced (no wildly biased coin)", () => {
  let heads = 0;
  const flips = 20_000;
  for (let trial = 0; trial < flips; trial++) {
    if (flipCoin() === "Heads") heads++;
  }
  const share = heads / flips;
  assert.ok(share > 0.45 && share < 0.55, `heads share ${share} outside 0.45..0.55`);
});

test("pick8BallResponse always answers from the canonical response list", () => {
  for (let trial = 0; trial < 2000; trial++) {
    assert.ok(EIGHT_BALL_RESPONSES.includes(pick8BallResponse()));
  }
});

test("the 8-ball response list has 20 unique entries", () => {
  assert.equal(EIGHT_BALL_RESPONSES.length, 20);
  assert.equal(new Set(EIGHT_BALL_RESPONSES).size, 20);
});

test("pick8BallResponse does not collapse to a single answer", () => {
  const seen = new Set();
  for (let trial = 0; trial < 5000; trial++) seen.add(pick8BallResponse());
  assert.ok(seen.size > 10, `only saw ${seen.size} distinct answers`);
});

test("rollDice output is well-formed randomness for the /roll command shape", () => {
  const { rolls, total } = rollDice(10, 20);
  assert.equal(rolls.length, 10);
  assert.ok(total >= 10 && total <= 200);
  assert.equal(
    total,
    rolls.reduce((sum, n) => sum + n, 0)
  );
});
