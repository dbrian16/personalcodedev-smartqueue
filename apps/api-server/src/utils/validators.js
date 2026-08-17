/**
 * Validates an email address format.
 * @param {string} email
 * @returns {boolean}
 */
const validateEmail = (email) =>
  typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/**
 * Validates a phone number (min 7 digits).
 * @param {string} phone
 * @returns {boolean}
 */
const validatePhone = (phone) =>
  typeof phone === 'string' && /^\d{7,}$/.test(phone.replace(/\D/g, ''));

const normalizeEmailValue = (value) => String(value || '').trim().toLowerCase();

const normalizePhoneValue = (value) => String(value || '').replace(/\D/g, '');

/**
 * Masks an email for privacy (e.g. j***@example.com)
 * @param {string} email
 * @returns {string}
 */
const maskEmail = (email) => {
  const normalized = normalizeEmailValue(email);
  const [user, domain] = normalized.split('@');
  if (!user || !domain) return '';
  const prefix = user.slice(0, 1);
  return `${prefix}***@${domain}`;
};

const maskPhone = (phone) => {
  const digits = normalizePhoneValue(phone);
  if (!digits) return '';
  const last4 = digits.slice(-4);
  return `***${last4}`;
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const addMinutes = (date, minutes) => new Date(date.getTime() + (Number(minutes) || 0) * 60 * 1000);

/**
 * Gets the current UTC date.
 * @returns {Date}
 */
const nowUtc = () => new Date();

module.exports = {
  validateEmail,
  validatePhone,
  normalizeEmailValue,
  normalizePhoneValue,
  maskEmail,
  maskPhone,
  toNumber,
  toDateOrNull,
  addMinutes,
  nowUtc
};
