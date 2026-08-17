/**
 * Short-lived security state: failed check-in attempts and one-time codes.
 *
 * WHY here rather than in Postgres: both are throwaway values with a natural
 * expiry, and both must work on the in-process backend too. Keeping them on the
 * key-value client means the lockout and the OTP flow behave identically whether
 * or not Redis is running.
 */
const { getRedisClient } = require('./connection');

const FAILURE_KEY = (scope) => `security:checkin_failures:${scope}`;
const OTP_KEY = (challengeId) => `security:otp:${challengeId}`;

/**
 * Counts one failed check-in attempt and returns the running total.
 * The TTL is refreshed on every failure so a slow brute-force attempt does not
 * outlast the window it is being measured in.
 */
const registerCheckinFailure = async (scope, windowMinutes) => {
  const client = getRedisClient();
  if (!client) return 0;

  const key = FAILURE_KEY(scope);
  const count = await client.incr(key);
  await client.expire(key, Math.max(60, Math.round(windowMinutes * 60)));
  return count;
};

const clearCheckinFailures = async (scope) => {
  const client = getRedisClient();
  if (client) await client.del(FAILURE_KEY(scope));
};

/**
 * Remaining lockout in seconds, or 0 when the scope is not locked.
 */
const getCheckinLockoutSeconds = async (scope, maxFailures) => {
  const client = getRedisClient();
  if (!client) return 0;

  const failures = Number(await client.get(FAILURE_KEY(scope))) || 0;
  if (failures < maxFailures) return 0;

  const ttl = await client.ttl(FAILURE_KEY(scope));
  return ttl > 0 ? ttl : 0;
};

const saveOtpChallenge = async (challengeId, payload, ttlSeconds) => {
  const client = getRedisClient();
  if (!client) return;
  await client.set(OTP_KEY(challengeId), JSON.stringify(payload), { EX: ttlSeconds });
};

const getOtpChallenge = async (challengeId) => {
  const client = getRedisClient();
  if (!client) return null;
  const raw = await client.get(OTP_KEY(challengeId));
  return raw ? JSON.parse(raw) : null;
};

const consumeOtpChallenge = async (challengeId) => {
  const client = getRedisClient();
  if (client) await client.del(OTP_KEY(challengeId));
};

module.exports = {
  registerCheckinFailure,
  clearCheckinFailures,
  getCheckinLockoutSeconds,
  saveOtpChallenge,
  getOtpChallenge,
  consumeOtpChallenge
};
