import test from "node:test";
import assert from "node:assert/strict";
import { checkCooldown, resetCooldown } from "../src/cooldowns.js";

function withFakeClock(ms, run) {
  const originalNow = Date.now;
  let now = ms;
  Date.now = () => now;
  try {
    return run({
      advance(step) {
        now += step;
      },
      get() {
        return now;
      },
    });
  } finally {
    Date.now = originalNow;
  }
}

test("first call within the window is allowed (returns 0)", () => {
  withFakeClock(1_000_000, (clock) => {
    assert.equal(checkCooldown("user-a", "ping", 3), 0);
    clock.advance(1000);
    assert.equal(checkCooldown("user-b", "ping", 3), 0);
  });
});

test("second call inside the window is blocked with the remaining seconds", () => {
  withFakeClock(1_000_000, (clock) => {
    assert.equal(checkCooldown("user-c", "dice", 3), 0);
    clock.advance(1000);
    const remaining = checkCooldown("user-c", "dice", 3);
    assert.ok(remaining > 0 && remaining <= 2, `expected 1 or 2 remaining, got ${remaining}`);
  });
});

test("cooldown is per user and per command", () => {
  withFakeClock(1_000_000, (clock) => {
    assert.equal(checkCooldown("user-d", "roll", 10), 0);
    clock.advance(500);
    assert.equal(checkCooldown("user-e", "roll", 10), 0);
    assert.equal(checkCooldown("user-d", "dice", 10), 0);
    clock.advance(100);
    assert.ok(checkCooldown("user-d", "roll", 10) > 0);
  });
});

test("cooldown expiry allows the command again", () => {
  withFakeClock(1_000_000, (clock) => {
    assert.equal(checkCooldown("user-f", "coinflip", 5), 0);
    clock.advance(4999);
    assert.ok(checkCooldown("user-f", "coinflip", 5) > 0, "still blocked just before expiry");
    clock.advance(2);
    assert.equal(checkCooldown("user-f", "coinflip", 5), 0, "allowed after expiry");
  });
});

test("a zero or negative cooldown disables throttling entirely", () => {
  withFakeClock(1_000_000, (clock) => {
    assert.equal(checkCooldown("user-g", "help", 0), 0);
    clock.advance(0);
    assert.equal(checkCooldown("user-g", "help", 0), 0);
    assert.equal(checkCooldown("user-g", "help", -3), 0);
  });
});

test("non-finite cooldown values are treated as disabled", () => {
  withFakeClock(1_000_000, () => {
    assert.equal(checkCooldown("user-nan", "ping", Number.NaN), 0);
    assert.equal(checkCooldown("user-nan", "ping", Number.POSITIVE_INFINITY), 0);
    assert.equal(checkCooldown("user-nan", "ping", Number.NEGATIVE_INFINITY), 0);
  });
});

test("resetCooldown clears a running cooldown", () => {
  withFakeClock(1_000_000, (clock) => {
    assert.equal(checkCooldown("user-h", "ban", 30), 0);
    clock.advance(100);
    assert.ok(checkCooldown("user-h", "ban", 30) > 0);
    resetCooldown("user-h", "ban");
    assert.equal(checkCooldown("user-h", "ban", 30), 0);
  });
});

test("remaining seconds are rounded up, never zero while still blocked", () => {
  withFakeClock(1_000_000, (clock) => {
    assert.equal(checkCooldown("user-i", "kick", 3), 0);
    clock.advance(2900);
    assert.equal(checkCooldown("user-i", "kick", 3), 1);
  });
});
