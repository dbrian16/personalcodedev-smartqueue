const crypto = require('crypto');
const log = require('./logger');
const { getRedisClient, isRedisReady } = require('../store/connection');
const { LOCK_RENEWALS_PER_TTL, LOCK_RENEW_MIN_INTERVAL_MS } = require('../config/constants');

// Both scripts compare the stored token before acting, so a lock is only ever
// released or extended by the holder that acquired it.
const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`;

const EXTEND_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  end
  return 0
`;

const lockError = (message, name, statusCode) => {
  const error = new Error(message);
  error.name = name;
  error.statusCode = statusCode;
  return error;
};

/**
 * Release and extend, expressed once per backend.
 *
 * Redis needs Lua because the read and the write are two round trips and another
 * client can win the key in between. The in-process backend has no such window —
 * Node runs the compare and the write in one turn of the event loop — so it does
 * the same check directly rather than shipping a script no interpreter would read.
 */
const release = async (client, lockKey, token) => {
  if (client.isMemory) {
    if (await client.get(lockKey) === token) await client.del(lockKey);
    return;
  }
  await client.eval(RELEASE_SCRIPT, { keys: [lockKey], arguments: [token] });
};

const extend = async (client, lockKey, token, duration) => {
  if (client.isMemory) {
    if (await client.get(lockKey) !== token) return 0;
    return client.pExpire(lockKey, duration);
  }
  return client.eval(EXTEND_SCRIPT, { keys: [lockKey], arguments: [token, String(duration)] });
};

/**
 * Runs a routine while holding an exclusive lock on the first resource.
 *
 * WHY the rewrite: the previous implementation stored a constant value and
 * released with an unconditional DEL, so a routine that outlived its TTL would
 * delete a lock another request had since acquired — exactly the double-call
 * race the lock exists to prevent. It also ran the routine *without* a lock
 * whenever Redis was unreachable, which turned an outage into silent corruption.
 *
 * @param {Array<string>} resources - Resource names; the first one is locked.
 * @param {number} duration - Lock TTL in ms. The lock is renewed while held.
 * @param {Function} routine - Receives a signal whose `aborted` flips to true if the lock is lost.
 * @returns {Promise<*>} Whatever the routine returns.
 */
const using = async (resources, duration, routine) => {
  if (!isRedisReady()) {
    throw lockError('Queue is temporarily unavailable, please try again shortly.', 'LockUnavailableError', 503);
  }

  const client = getRedisClient();
  const lockKey = `lock:${resources[0]}`;
  const token = crypto.randomUUID();

  const acquired = await client.set(lockKey, token, { NX: true, PX: duration });
  if (!acquired) {
    throw lockError('This queue is busy processing another request, please try again.', 'ExecutionError', 409);
  }

  const signal = { aborted: false };
  const renewIntervalMs = Math.max(Math.floor(duration / LOCK_RENEWALS_PER_TTL), LOCK_RENEW_MIN_INTERVAL_MS);

  // Renewing while the routine runs means a slow request (AI call, ETA rewrite)
  // no longer loses its lock mid-flight.
  const renewTimer = setInterval(async () => {
    try {
      const extended = await extend(client, lockKey, token, duration);
      if (!extended) {
        signal.aborted = true;
        log.warn('lock:lost', { lockKey });
      }
    } catch (error) {
      signal.aborted = true;
      log.warn('lock:renew_failed', { lockKey, error: error.message });
    }
  }, renewIntervalMs);
  if (typeof renewTimer.unref === 'function') renewTimer.unref();

  try {
    return await routine(signal);
  } finally {
    clearInterval(renewTimer);
    try {
      await release(client, lockKey, token);
    } catch (error) {
      // The TTL will clear it; losing the release is not worth failing the request.
      log.warn('lock:release_failed', { lockKey, error: error.message });
    }
  }
};

const DEFAULT_LOCK_TTL_MS = 5000;

/**
 * The way every controller actually wants to take a queue lock.
 *
 * Each call site used to repeat three things: the `locks:` key prefix, the
 * `signal.aborted` guard, and — in the staff console — a try/catch turning a
 * contended lock into a 409 with the message written out twice. All of it is
 * here once now.
 *
 * @param {string} resource - Lock name without the prefix, e.g. `queue:lead:12`.
 * @param {{ttlMs?: number, busyMessage?: string}} options
 * @param {(signal: {aborted: boolean}) => Promise<*>} routine
 * @returns {Promise<*>} Whatever the routine returns.
 */
const withQueueLock = async (resource, options, routine) => {
  const { ttlMs = DEFAULT_LOCK_TTL_MS, busyMessage } = options || {};

  try {
    return await using([`locks:${resource}`], ttlMs, async (signal) => {
      if (signal.aborted) throw new Error('Lock expired before the operation completed');
      return routine(signal);
    });
  } catch (error) {
    // Without a message of its own the caller still gets the lock's own 409.
    if (busyMessage && error.name === 'ExecutionError') {
      throw lockError(busyMessage, 'ExecutionError', 409);
    }
    throw error;
  }
};

module.exports = { redlock: { using }, withQueueLock, DEFAULT_LOCK_TTL_MS };
