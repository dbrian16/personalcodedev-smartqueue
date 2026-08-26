/**
 * One-time code verification for online bookings.
 *
 * An SMS code needs a paid provider, so the flow is built behind a provider
 * interface: switching to a real gateway is one adapter, while local runs use
 * the console provider and no external service at all. Set OTP_ENABLED=false to
 * skip verification entirely.
 */
const crypto = require('crypto');
const config = require('../config');
const store = require('../store');
const log = require('../utils/logger');
const { throwError } = require('../utils/AppError');
const { safeCompare } = require('../utils/crypto');
const { maskEmail, maskPhone } = require('../utils/validators');

const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const TTL_SECONDS = 10 * 60;

const generateCode = () => String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');

const providers = {
  /** Writes the code to the server log. Enough to run and demo the flow locally. */
  console: async ({ destination, code, channel }) => {
    log.info('otp:issued', {
      channel,
      destination: channel === 'email' ? maskEmail(destination) : maskPhone(destination),
      code
    });
    return { delivered: true, via: 'console' };
  }
};

const getProvider = () => providers[config.OTP_PROVIDER] || providers.console;

const isEnabled = () => config.OTP_ENABLED;

/**
 * Issues a code bound to a destination and an arbitrary payload.
 * The payload is what the caller wants back once the code checks out. For a
 * booking that is the validated booking request, so the details cannot be
 * swapped between requesting the code and redeeming it.
 *
 * @param {{channel: 'phone'|'email', destination: string, purpose: string, payload: Object}} request
 * @returns {Promise<{challengeId: string, expiresAt: string, devCode?: string}>}
 */
const requestChallenge = async ({ channel, destination, purpose, payload }) => {
  const challengeId = crypto.randomUUID();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

  await store.saveOtpChallenge(
    challengeId,
    {
      channel,
      destination,
      purpose,
      payload,
      codeHash: crypto.createHash('sha256').update(code).digest('hex'),
      attempts: 0,
      expiresAt: expiresAt.toISOString()
    },
    TTL_SECONDS
  );

  await getProvider()({ destination, code, channel });

  return {
    challengeId,
    expiresAt: expiresAt.toISOString(),
    // Without a real gateway the caller has no other way to obtain the code.
    // Hard-disabled in production by config.
    ...(config.OTP_DEV_ECHO ? { devCode: code } : {})
  };
};

/**
 * Redeems a code and returns the payload it was issued against.
 * A challenge is consumed on success and after too many wrong guesses, so a code
 * is single-use and cannot be brute-forced.
 *
 * @returns {Promise<Object>} The payload supplied at request time.
 */
const verifyChallenge = async (challengeId, code, purpose) => {
  const id = String(challengeId || '').trim();
  if (!id) throwError('Verification is required. Please request a code first.');

  const challenge = await store.getOtpChallenge(id);
  if (!challenge) throwError('That code has expired. Please request a new one.', 410);

  if (purpose && challenge.purpose !== purpose) {
    await store.consumeOtpChallenge(id);
    throwError('That code was issued for a different action.', 400);
  }

  const supplied = String(code || '').trim();
  const suppliedHash = crypto.createHash('sha256').update(supplied).digest('hex');

  if (!safeCompare(suppliedHash, challenge.codeHash)) {
    challenge.attempts += 1;
    if (challenge.attempts >= MAX_ATTEMPTS) {
      await store.consumeOtpChallenge(id);
      throwError('Too many incorrect codes. Please start again.', 429);
    }
    const remainingTtl = Math.max(
      30,
      Math.round((new Date(challenge.expiresAt).getTime() - Date.now()) / 1000)
    );
    await store.saveOtpChallenge(id, challenge, remainingTtl);
    throwError(`Incorrect code. ${MAX_ATTEMPTS - challenge.attempts} attempts remaining.`, 401);
  }

  await store.consumeOtpChallenge(id);
  return challenge.payload;
};

module.exports = {
  isEnabled,
  requestChallenge,
  verifyChallenge
};
