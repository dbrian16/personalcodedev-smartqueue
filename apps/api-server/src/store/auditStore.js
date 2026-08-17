const { getPool, getRedisClient, usingDb } = require('./connection');
const { nowUtc } = require('../utils/validators');

const recordCheckinAuditDb = async (record) => {
  const pool = getPool();
  await pool.query(
    `INSERT INTO checkin_audit (
      ticket_number,
      success,
      reason,
      identifier_type,
      identifier_hash,
      identifier_mask,
      ip,
      user_agent
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      record.ticketNumber,
      !!record.success,
      record.reason || null,
      record.identifierType || null,
      record.identifierHash || null,
      record.identifierMask || null,
      record.ip || null,
      record.userAgent || null
    ]
  );
};

const recordCheckinAuditRedis = async (record) => {
  const redisClient = getRedisClient();
  if (!redisClient) return;
  await redisClient.rPush('checkin_audit', JSON.stringify(record));
  await redisClient.lTrim('checkin_audit', -5000, -1);
};

/**
 * Records an audit log for an online ticket check-in attempt.
 * @param {Object} entry - The audit record data
 * @param {string} entry.ticketNumber
 * @param {boolean} entry.success
 * @param {string} [entry.reason]
 * @param {string} [entry.identifierType]
 * @param {string} [entry.identifierHash]
 * @param {string} [entry.identifierMask]
 * @param {string} [entry.ip]
 * @param {string} [entry.userAgent]
 * @returns {Promise<void>}
 */
const recordCheckinAudit = async (entry) => {
  const record = {
    id: Date.now(),
    createdAt: nowUtc(),
    ...entry
  };
  return usingDb()
    ? recordCheckinAuditDb(record)
    : recordCheckinAuditRedis(record);
};

module.exports = {
  recordCheckinAudit
};
