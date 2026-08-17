const crypto = require('crypto');

const safeCompare = (left, right) => {
  const leftStr = String(left || '');
  const rightStr = String(right || '');
  const leftHash = crypto.createHash('sha256').update(leftStr, 'utf8').digest();
  const rightHash = crypto.createHash('sha256').update(rightStr, 'utf8').digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
};

const hashValue = (value) =>
  crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');

module.exports = {
  safeCompare,
  hashValue
};
