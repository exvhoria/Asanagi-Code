/**
 * In-memory cooldown buckets keyed by "commandName:userId", each value being
 * the epoch-ms timestamp at which the cooldown expires.
 *
 * @type {Map<string, number>}
 */
const buckets = new Map();

/**
 * Applies a per-user, per-command cooldown.
 * When no cooldown is active, starts one lasting `seconds` and returns 0.
 * When one is active, returns the whole seconds remaining without restarting it.
 * A `seconds` value that is 0, negative, or non-finite is treated as
 * "no cooldown".
 * Buckets are pruned opportunistically once the map grows past 5000 entries.
 *
 * @param {string} userId - Discord ID of the user invoking the command.
 * @param {string} commandName - Name of the command being invoked.
 * @param {number} seconds - Cooldown window length in seconds.
 * @returns {number} 0 when the command may proceed, otherwise whole seconds remaining.
 * @throws {never} Pure in-memory Map operations.
 * @example
 * checkCooldown("123", "ping", 3); // 0 when proceeding, otherwise seconds remaining
 */
export function checkCooldown(userId, commandName, seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const key = `${commandName}:${userId}`;
  const now = Date.now();
  const expiresAt = buckets.get(key) ?? 0;

  if (expiresAt > now) return Math.ceil((expiresAt - now) / 1000);

  buckets.set(key, now + seconds * 1000);

  if (buckets.size > 5000) {
    for (const [k, expiry] of buckets) {
      if (expiry <= now) buckets.delete(k);
    }
  }

  return 0;
}

/**
 * Clears any active cooldown for the given user and command, allowing the
 * next checkCooldown call to succeed immediately. No-op when none is active.
 *
 * @param {string} userId - Discord ID of the user whose cooldown should be cleared.
 * @param {string} commandName - Name of the command whose cooldown should be cleared.
 * @returns {void}
 * @throws {never} Pure in-memory Map operations.
 * @example
 * resetCooldown("123", "ping");
 */
export function resetCooldown(userId, commandName) {
  buckets.delete(`${commandName}:${userId}`);
}
