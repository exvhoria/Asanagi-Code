import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_REPEAT_LENGTH,
  MAX_REPEAT_TIMES,
  buildRepeat,
  recordMessage,
  topChannels,
  totalMessages,
  validateRepeat,
} from "../src/lib/stats.js";

test("recordMessage starts at 1 and increments per channel", () => {
  const counts = {};
  assert.equal(recordMessage(counts, "chan-a"), 1);
  assert.equal(recordMessage(counts, "chan-a"), 2);
  assert.equal(recordMessage(counts, "chan-b"), 1);
  assert.deepEqual(counts, { "chan-a": 2, "chan-b": 1 });
});

test("topChannels sorts by count desc then by channel id", () => {
  const counts = { "b-chan": 3, "a-chan": 5, "c-chan": 3, "d-chan": 1 };
  assert.deepEqual(topChannels(counts), [
    { channelId: "a-chan", count: 5 },
    { channelId: "b-chan", count: 3 },
    { channelId: "c-chan", count: 3 },
    { channelId: "d-chan", count: 1 },
  ]);
});

test("topChannels respects the limit", () => {
  const counts = { a: 1, b: 2, c: 3, d: 4, e: 5 };
  assert.deepEqual(topChannels(counts, 2), [
    { channelId: "e", count: 5 },
    { channelId: "d", count: 4 },
  ]);
  assert.deepEqual(topChannels(counts, 0), []);
});

test("topChannels treats a negative limit as zero", () => {
  assert.deepEqual(topChannels({ a: 1, b: 2 }, -1), []);
});

test("topChannels handles empty counts", () => {
  assert.deepEqual(topChannels({}), []);
});

test("totalMessages sums every channel", () => {
  assert.equal(totalMessages({ a: 3, b: 5 }), 8);
  assert.equal(totalMessages({}), 0);
});

test("validateRepeat accepts normal input", () => {
  assert.deepEqual(validateRepeat("hello", 1), { ok: true });
  assert.deepEqual(validateRepeat("hello", MAX_REPEAT_TIMES), { ok: true });
  assert.deepEqual(validateRepeat("a".repeat(MAX_REPEAT_LENGTH), 2), { ok: true });
});

test("validateRepeat rejects empty text", () => {
  assert.equal(validateRepeat("", 1).ok, false);
  assert.equal(validateRepeat("   ", 1).ok, false);
});

test("validateRepeat rejects text longer than the limit", () => {
  const result = validateRepeat("a".repeat(MAX_REPEAT_LENGTH + 1), 1);
  assert.equal(result.ok, false);
  assert.match(result.error, /max 200/);
});

test("validateRepeat rejects out-of-range times", () => {
  assert.equal(validateRepeat("hi", 0).ok, false);
  assert.equal(validateRepeat("hi", -1).ok, false);
  assert.equal(validateRepeat("hi", MAX_REPEAT_TIMES + 1).ok, false);
  assert.equal(validateRepeat("hi", 1.5).ok, false);
  assert.equal(validateRepeat("hi", undefined).ok, false);
  assert.match(validateRepeat("hi", MAX_REPEAT_TIMES + 1).error, /at most 5/);
});

test("buildRepeat joins with newlines", () => {
  assert.deepEqual(buildRepeat("hi", 3), { ok: true, output: "hi\nhi\nhi" });
  assert.deepEqual(buildRepeat("hi", 1), { ok: true, output: "hi" });
});

test("buildRepeat forwards validation errors", () => {
  assert.deepEqual(buildRepeat("", 2), validateRepeat("", 2));
  assert.equal(buildRepeat("hi", 9).ok, false);
});
