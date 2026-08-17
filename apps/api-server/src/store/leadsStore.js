const { getPool, getRedisClient, usingDb } = require('./connection');
const { toNumber, normalizeEmailValue, normalizePhoneValue } = require('../utils/validators');
const { throwError } = require('../utils/AppError');
const { ACTIVE_LEAD_STATUSES } = require('../config/constants');

// A single key, deliberately without a TTL: keying by date silently dropped every
// ticket at midnight, and refreshing a TTL only on create expired the whole queue
// after a quiet day. Retention is a cleanup job's business, not the read path's.
const LEADS_KEY = 'leads';
const getLeadsKey = () => LEADS_KEY;

const timeOf = (value) => {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Effective queue time — the single ordering key for the queue.
 *
 * WHY: ordering used to be decided by three overlapping rules (a priority flag, the
 * ticket source, and a timestamp that check-in silently reset), which made every
 * combination its own test case and meant a booked ticket queued exactly like a
 * walk-in. One key replaces all of it: a booking is ordered by its appointment time
 * or its arrival, whichever is later. Arriving early gains nothing; arriving late
 * costs the appointment; a walk-in can never be pushed back indefinitely.
 */
const computeEffectiveQueueTime = (lead) => {
  if (lead.effectiveQueueTime) return new Date(lead.effectiveQueueTime);

  const arrival = lead.checkedInAt || lead.timestamp;
  if (lead.scheduledFor) {
    const scheduled = timeOf(lead.scheduledFor);
    const arrived = timeOf(arrival);
    return new Date(Math.max(scheduled, arrived));
  }
  return new Date(timeOf(arrival) || Date.now());
};

const sortLeads = (items) => [...items].sort((a, b) => {
  const diff = timeOf(computeEffectiveQueueTime(a)) - timeOf(computeEffectiveQueueTime(b));
  // Ticket id breaks exact ties so the order never flickers between two reads.
  return diff !== 0 ? diff : Number(a.id) - Number(b.id);
});

const normalizeLead = (lead) => {
  const normalized = {
    id: Number(lead.id),
    ticketNumber: lead.ticketNumber,
    email: lead.email,
    phone: lead.phone,
    service: lead.service,
    staff: lead.staff || null,
    source: lead.source,
    status: lead.status,
    priority: !!lead.priority,
    tags: Array.isArray(lead.tags) ? lead.tags : [],
    notes: lead.notes || '',
    predictedWaitTime: toNumber(lead.predictedWaitTime),
    // 'Low' | 'Medium' | 'Busy' | 'Unavailable'. Stored rather than derived from
    // the minutes, because "nobody is on duty" and "a zero-minute wait" are the
    // same number and must not look the same to a customer.
    queueStatus: lead.queueStatus || 'Low',
    assignedPosition: lead.assignedPosition,
    timestamp: lead.timestamp,
    calledAt: lead.calledAt || undefined,
    servingAt: lead.servingAt || undefined,
    completedAt: lead.completedAt || undefined,
    scheduledFor: lead.scheduledFor || undefined,
    pendingExpiresAt: lead.pendingExpiresAt || undefined,
    checkedInAt: lead.checkedInAt || undefined,
    recallCount: toNumber(lead.recallCount) || 0,
    walkInDowngraded: !!lead.walkInDowngraded,
    cancelReason: lead.cancelReason || undefined,
    longSessionAlertedAt: lead.longSessionAlertedAt || undefined,
    // Conditions when the ticket was issued. Kept so a served ticket can become a
    // training row for the wait-time model without needing hindsight.
    queuePositionAtCreation: toNumber(lead.queuePositionAtCreation) || 0,
    activeStaffAtCreation: toNumber(lead.activeStaffAtCreation) || 1,
    averageServiceTimeAtCreation: toNumber(lead.averageServiceTimeAtCreation) || 0,
    feedback: lead.feedback || undefined
  };

  normalized.effectiveQueueTime = computeEffectiveQueueTime({
    ...lead,
    effectiveQueueTime: lead.effectiveQueueTime
  });

  return normalized;
};

const publicLead = (lead) => {
  const normalized = normalizeLead(lead);
  return {
    id: normalized.id,
    ticketNumber: normalized.ticketNumber,
    service: normalized.service,
    source: normalized.source,
    status: normalized.status,
    priority: normalized.priority,
    predictedWaitTime: normalized.predictedWaitTime,
    queueStatus: normalized.queueStatus,
    assignedPosition: normalized.assignedPosition,
    timestamp: normalized.timestamp,
    calledAt: normalized.calledAt,
    servingAt: normalized.servingAt,
    completedAt: normalized.completedAt,
    scheduledFor: normalized.scheduledFor,
    pendingExpiresAt: normalized.pendingExpiresAt,
    checkedInAt: normalized.checkedInAt,
    recallCount: normalized.recallCount,
    walkInDowngraded: normalized.walkInDowngraded,
    cancelReason: normalized.cancelReason,
    hasFeedback: !!normalized.feedback
  };
};

const rowToLead = (row) => normalizeLead({
  id: row.id,
  ticketNumber: row.ticket_number,
  email: row.email,
  phone: row.phone,
  service: row.service,
  staff: row.staff,
  source: row.source,
  status: row.status,
  priority: row.priority,
  tags: row.tags,
  notes: row.notes,
  predictedWaitTime: row.predicted_wait_time,
  queueStatus: row.queue_status,
  assignedPosition: row.assigned_position,
  timestamp: row.created_at,
  calledAt: row.called_at,
  servingAt: row.serving_at,
  completedAt: row.completed_at,
  scheduledFor: row.scheduled_for,
  pendingExpiresAt: row.pending_expires_at,
  checkedInAt: row.checked_in_at,
  recallCount: row.recall_count,
  effectiveQueueTime: row.effective_queue_time,
  walkInDowngraded: row.walk_in_downgraded,
  cancelReason: row.cancel_reason,
  longSessionAlertedAt: row.long_session_alerted_at,
  queuePositionAtCreation: row.queue_position_at_creation,
  activeStaffAtCreation: row.active_staff_at_creation,
  averageServiceTimeAtCreation: row.average_service_time_at_creation,
  feedback: row.feedback
});

const listLeadsDb = async (position, options = {}) => {
  const pool = getPool();
  const includePending = !!options.includePending;
  const params = [];
  let query = 'SELECT * FROM leads';
  const where = [];
  if (position) {
    params.push(position);
    where.push(`assigned_position = $${params.length}`);
  }
  if (!includePending) {
    where.push(`status NOT IN ('Pending', 'Cancelled')`);
  }
  if (where.length > 0) query += ` WHERE ${where.join(' AND ')}`;
  query += ' ORDER BY COALESCE(effective_queue_time, created_at) ASC, id ASC';
  const result = await pool.query(query, params);
  return result.rows.map(rowToLead);
};

const listLeadsRedis = async (position, options = {}) => {
  const redisClient = getRedisClient();
  if (!redisClient) return [];
  const includePending = !!options.includePending;
  const leadsData = await redisClient.hGetAll(getLeadsKey());
  const allLeads = Object.values(leadsData).map((val) => JSON.parse(val));
  const filtered = position ? allLeads.filter((lead) => lead.assignedPosition === position) : allLeads;
  const liveOnly = includePending ? filtered : filtered.filter((lead) => !['Pending', 'Cancelled'].includes(lead.status));
  return sortLeads(liveOnly).map(normalizeLead);
};

/**
 * Lists leads based on position and options.
 * @param {string|null} position
 * @param {Object} [options={}]
 * @param {boolean} [options.includePending=false]
 * @returns {Promise<Array<Object>>}
 */
const listLeads = async (position, options = {}) => usingDb()
  ? listLeadsDb(position, options)
  : listLeadsRedis(position, options);

const getLeadByIdDb = async (id) => {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM leads WHERE id = $1', [id]);
  return result.rows[0] ? rowToLead(result.rows[0]) : null;
};

const getLeadByIdRedis = async (id) => {
  const redisClient = getRedisClient();
  if (!redisClient) return null;
  const data = await redisClient.hGet(getLeadsKey(), String(id));
  return data ? normalizeLead(JSON.parse(data)) : null;
};

/**
 * Gets a lead by internal ID.
 * @param {number|string} id
 * @returns {Promise<Object|null>}
 */
const getLeadById = async (id) => usingDb()
  ? getLeadByIdDb(id)
  : getLeadByIdRedis(id);

const getLeadByTicketDb = async (ticketNumber) => {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM leads WHERE LOWER(ticket_number) = LOWER($1)',
    [ticketNumber]
  );
  return result.rows[0] ? rowToLead(result.rows[0]) : null;
};

const getLeadByTicketRedis = async (ticketNumber) => {
  const redisClient = getRedisClient();
  if (!redisClient) return null;
  const leadsData = await redisClient.hGetAll(getLeadsKey());
  const allLeads = Object.values(leadsData).map((val) => JSON.parse(val));
  const lead = allLeads.find(
    (item) => String(item.ticketNumber).toLowerCase() === String(ticketNumber).toLowerCase()
  );
  return lead ? normalizeLead(lead) : null;
};

/**
 * Gets a lead by its public ticket number.
 * @param {string} ticketNumber
 * @returns {Promise<Object|null>}
 */
const getLeadByTicket = async (ticketNumber) => usingDb()
  ? getLeadByTicketDb(ticketNumber)
  : getLeadByTicketRedis(ticketNumber);

const createLeadDb = async (data) => {
  const pool = getPool();
  const nextTicket = await pool.query("SELECT nextval('ticket_counter') AS ticket");
  const ticketNumber = `TKT-${nextTicket.rows[0].ticket}`;
  const createdAt = data.timestamp || new Date();
  const result = await pool.query(
    `INSERT INTO leads (
      ticket_number, email, phone, service, staff, source, status, priority,
      tags, notes, predicted_wait_time, assigned_position, created_at,
      scheduled_for, pending_expires_at, checked_in_at, recall_count, effective_queue_time,
      queue_position_at_creation, active_staff_at_creation, average_service_time_at_creation,
      queue_status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '[]'::jsonb, '', $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
    RETURNING *`,
    [
      ticketNumber,
      data.email,
      data.phone,
      data.service,
      data.staff || null,
      data.source,
      data.status || 'Waiting',
      !!data.priority,
      data.predictedWaitTime || 0,
      data.assignedPosition,
      createdAt,
      data.scheduledFor || null,
      data.pendingExpiresAt || null,
      data.checkedInAt || null,
      toNumber(data.recallCount) || 0,
      data.effectiveQueueTime || computeEffectiveQueueTime({ ...data, timestamp: createdAt }),
      toNumber(data.queuePositionAtCreation) || 0,
      toNumber(data.activeStaffAtCreation) || 1,
      toNumber(data.averageServiceTimeAtCreation) || 0,
      // Without this the column fell back to its 'Low' default, so a reservation
      // created while no counter was open read as a short wait on Postgres and as
      // "Unavailable" on the key-value store — the same ticket, two answers.
      data.queueStatus || 'Low'
    ]
  );
  return rowToLead(result.rows[0]);
};

const createLeadRedis = async (data) => {
  const redisClient = getRedisClient();
  if (!redisClient) throw new Error('Queue store is not connected');
  const newId = await redisClient.incr('ticket_counter');
  const createdAt = data.timestamp || new Date();
  const newLead = normalizeLead({
    id: Date.now() + newId,
    ticketNumber: `TKT-${newId}`,
    email: data.email,
    phone: data.phone,
    service: data.service,
    staff: data.staff,
    source: data.source,
    status: data.status || 'Waiting',
    priority: data.priority,
    tags: [],
    notes: '',
    predictedWaitTime: data.predictedWaitTime,
    assignedPosition: data.assignedPosition,
    timestamp: createdAt,
    scheduledFor: data.scheduledFor || undefined,
    pendingExpiresAt: data.pendingExpiresAt || undefined,
    checkedInAt: data.checkedInAt || undefined,
    recallCount: toNumber(data.recallCount) || 0,
    effectiveQueueTime: data.effectiveQueueTime || undefined,
    queuePositionAtCreation: data.queuePositionAtCreation,
    activeStaffAtCreation: data.activeStaffAtCreation,
    averageServiceTimeAtCreation: data.averageServiceTimeAtCreation
  });
  await redisClient.hSet(getLeadsKey(), String(newLead.id), JSON.stringify(newLead));
  return newLead;
};

/**
 * Creates a new lead in the store.
 * @param {Object} data
 * @returns {Promise<Object>} The created lead.
 */
const createLead = async (data) => usingDb()
  ? createLeadDb(data)
  : createLeadRedis(data);

const saveLeadDb = async (lead) => {
  const pool = getPool();
  const normalized = normalizeLead(lead);
  const result = await pool.query(
    `UPDATE leads SET
      email = $2,
      phone = $3,
      service = $4,
      staff = $5,
      source = $6,
      status = $7,
      priority = $8,
      tags = $9::jsonb,
      notes = $10,
      predicted_wait_time = $11,
      assigned_position = $12,
      called_at = $13,
      serving_at = $14,
      completed_at = $15,
      feedback = $16::jsonb,
      created_at = $17,
      scheduled_for = $18,
      pending_expires_at = $19,
      checked_in_at = $20,
      recall_count = $21,
      effective_queue_time = $22,
      walk_in_downgraded = $23,
      cancel_reason = $24,
      long_session_alerted_at = $25,
      queue_position_at_creation = $26,
      active_staff_at_creation = $27,
      average_service_time_at_creation = $28,
      queue_status = $29
    WHERE id = $1
    RETURNING *`,
    [
      normalized.id,
      normalized.email,
      normalized.phone,
      normalized.service,
      normalized.staff,
      normalized.source,
      normalized.status,
      normalized.priority,
      JSON.stringify(normalized.tags),
      normalized.notes,
      normalized.predictedWaitTime,
      normalized.assignedPosition,
      normalized.calledAt || null,
      normalized.servingAt || null,
      normalized.completedAt || null,
      normalized.feedback ? JSON.stringify(normalized.feedback) : null,
      normalized.timestamp || new Date(),
      normalized.scheduledFor || null,
      normalized.pendingExpiresAt || null,
      normalized.checkedInAt || null,
      toNumber(normalized.recallCount) || 0,
      normalized.effectiveQueueTime,
      normalized.walkInDowngraded,
      normalized.cancelReason || null,
      normalized.longSessionAlertedAt || null,
      normalized.queuePositionAtCreation,
      normalized.activeStaffAtCreation,
      normalized.averageServiceTimeAtCreation,
      normalized.queueStatus
    ]
  );
  if (!result.rows[0]) throwError(`Lead ${normalized.id} no longer exists in the queue store`, 404);
  return rowToLead(result.rows[0]);
};

const saveLeadRedis = async (lead) => {
  const redisClient = getRedisClient();
  if (!redisClient) throwError('Queue store is unavailable, please try again shortly.', 503);

  const normalized = normalizeLead(lead);
  const leadsKey = getLeadsKey();

  // hSet would happily resurrect a deleted lead, so require it to exist first —
  // but report the miss instead of returning as if the write had succeeded.
  const exists = await redisClient.hExists(leadsKey, String(normalized.id));
  if (!exists) throwError(`Lead ${normalized.id} no longer exists in the queue store`, 404);

  await redisClient.hSet(leadsKey, String(normalized.id), JSON.stringify(normalized));
  return normalized;
};

/**
 * Saves/updates an existing lead.
 * @param {Object} lead - The lead to update
 * @returns {Promise<Object>} The updated lead.
 */
const saveLead = async (lead) => usingDb()
  ? saveLeadDb(lead)
  : saveLeadRedis(lead);

/**
 * Every still-live ticket held by one person — the basis for the per-customer cap
 *, the self-service cancel flow and lookup by contact detail.
 * @param {{email?: string, phone?: string}} contact
 * @returns {Promise<Array<Object>>}
 */
const listActiveLeadsByContact = async ({ email, phone }) => {
  const wantedEmail = normalizeEmailValue(email);
  const wantedPhone = normalizePhoneValue(phone);
  if (!wantedEmail && !wantedPhone) return [];

  const all = await listLeads(null, { includePending: true });
  return sortLeads(all.filter((lead) => {
    if (!ACTIVE_LEAD_STATUSES.includes(lead.status)) return false;
    if (wantedEmail && normalizeEmailValue(lead.email) === wantedEmail) return true;
    if (wantedPhone && normalizePhoneValue(lead.phone) === wantedPhone) return true;
    return false;
  }));
};

/**
 * Bookings already holding a place in the appointment slot that contains `slotStart`.
 * Used to enforce slot capacity — the old overload guard measured the queue at
 * the moment of booking, which says nothing about the slot being booked.
 */
const countBookingsInSlot = async (service, slotStart, slotEnd) => {
  const all = await listLeads(service, { includePending: true });
  const from = slotStart.getTime();
  const to = slotEnd.getTime();

  return all.filter((lead) => {
    if (!ACTIVE_LEAD_STATUSES.includes(lead.status)) return false;
    if (!lead.scheduledFor) return false;
    const at = timeOf(lead.scheduledFor);
    return at >= from && at < to;
  }).length;
};

module.exports = {
  getLeadsKey,
  sortLeads,
  computeEffectiveQueueTime,
  normalizeLead,
  publicLead,
  rowToLead,
  listLeads,
  getLeadById,
  getLeadByTicket,
  createLead,
  saveLead,
  listActiveLeadsByContact,
  countBookingsInSlot
};
