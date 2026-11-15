import test from "node:test";
import assert from "node:assert/strict";
import { MAX_DURATION_MS, formatMs, parseDuration } from "../src/lib/duration.js";

test("parseDuration rejects combined units like '1h30m'", () => {
  assert.equal(parseDuration("1h30m"), null);
  assert.equal(parseDuration("1d12h"), null);
  assert.equal(parseDuration("1h30"), null);
});

test("parseDuration keeps every zero variant as 0 (falsy, rejected downstream)", () => {
  assert.equal(parseDuration("0h"), 0);
  assert.equal(parseDuration("0d"), 0);
  assert.equal(parseDuration("0w"), 0);
  assert.equal(parseDuration("00"), 0);
  assert.ok(!parseDuration("0w"));
});

test("parseDuration rejects negative durations, including unicode minus", () => {
  assert.equal(parseDuration("-1d"), null);
  assert.equal(parseDuration("−5m"), null);
});

test("parseDuration rejects floats in any position", () => {
  assert.equal(parseDuration("0.5m"), null);
  assert.equal(parseDuration("1.5h"), null);
  assert.equal(parseDuration("2.d"), null);
  assert.equal(parseDuration(".5s"), null);
});

test("parseDuration rejects scientific and padded exponent input", () => {
  assert.equal(parseDuration("1e2"), null);
  assert.equal(parseDuration("1E2m"), null);
});

test("parseDuration treats a space before the unit as valid", () => {
  assert.equal(parseDuration("5 m"), 300_000);
  assert.equal(parseDuration("2 H"), 7_200_000);
});

test("parseDuration handles uppercase M and W units", () => {
  assert.equal(parseDuration("5M"), 300_000);
  assert.equal(parseDuration("2W"), 1_209_600_000);
});

test("parseDuration keeps leading zeros as plain decimal", () => {
  assert.equal(parseDuration("007m"), 420_000);
  assert.equal(parseDuration("000s"), 0);
});

test("parseDuration accepts durations beyond MAX_DURATION_MS (clamped downstream)", () => {
  assert.equal(parseDuration("365d"), 365 * 86_400_000);
  assert.ok(parseDuration("365d") > MAX_DURATION_MS);
});

test("parseDuration rejects doubled and stray units", () => {
  assert.equal(parseDuration("5mm"), null);
  assert.equal(parseDuration("5s s"), null);
  assert.equal(parseDuration("hh"), null);
});

test("formatMs(0) renders as zero minutes-rounded days", () => {
  assert.equal(formatMs(0), "0 day(s)");
});

test("formatMs rounds 59.999s up to one minute, while effectively-zero values hit the days branch", () => {
  assert.equal(formatMs(59_999), "1 minute(s)");
  assert.equal(formatMs(1), "0 day(s)", "0 minutes satisfies the days branch first");
});
