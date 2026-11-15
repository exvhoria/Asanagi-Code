import test from "node:test";
import assert from "node:assert/strict";
import { MAX_DURATION_MS, formatMs, parseDuration } from "../src/lib/duration.js";

test("parseDuration supports every documented unit", () => {
  assert.equal(parseDuration("30s"), 30_000);
  assert.equal(parseDuration("10m"), 600_000);
  assert.equal(parseDuration("2h"), 7_200_000);
  assert.equal(parseDuration("1d"), 86_400_000);
  assert.equal(parseDuration("1w"), 604_800_000);
});

test("parseDuration defaults to minutes when no unit is given", () => {
  assert.equal(parseDuration("5"), 300_000);
  assert.equal(parseDuration("90"), 5_400_000);
});

test("parseDuration is case-insensitive and tolerates inner spacing", () => {
  assert.equal(parseDuration("30S"), 30_000);
  assert.equal(parseDuration("2H"), 7_200_000);
  assert.equal(parseDuration("1 W"), 604_800_000);
  assert.equal(parseDuration("  10m "), 600_000);
});

test("parseDuration rejects invalid inputs", () => {
  assert.equal(parseDuration(""), null);
  assert.equal(parseDuration("   "), null);
  assert.equal(parseDuration("abc"), null);
  assert.equal(parseDuration("s"), null);
  assert.equal(parseDuration("30x"), null);
  assert.equal(parseDuration("30sec"), null);
  assert.equal(parseDuration("m30"), null);
  assert.equal(parseDuration("-5m"), null);
  assert.equal(parseDuration("1.5h"), null);
  assert.equal(parseDuration("10 20"), null);
});

test("parseDuration keeps '0' as zero (rejected downstream as falsy)", () => {
  assert.equal(parseDuration("0"), 0);
  assert.equal(parseDuration("0s"), 0);
  assert.ok(!parseDuration("0"), "a zero duration is falsy, so the command treats it as invalid");
});

test("MAX_DURATION_MS is exactly seven days", () => {
  assert.equal(MAX_DURATION_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(parseDuration("7d"), MAX_DURATION_MS);
});

test("formatMs renders days, hours, or minutes", () => {
  assert.equal(formatMs(86_400_000), "1 day(s)");
  assert.equal(formatMs(2 * 86_400_000), "2 day(s)");
  assert.equal(formatMs(7_200_000), "2 hour(s)");
  assert.equal(formatMs(600_000), "10 minute(s)");
  assert.equal(formatMs(61_000 * 60), "61 minute(s)");
});
