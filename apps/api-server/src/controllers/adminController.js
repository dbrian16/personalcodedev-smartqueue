const catchAsync = require('../utils/catchAsync');
const store = require('../store');
const queueService = require('../services/queueService');
const aiService = require('../services/aiService');
const businessService = require('../services/businessService');
const { throwError } = require('../utils/AppError');
const { VALID_STAFF_STATUSES, LIVE_LEAD_STATUSES } = require('../config/constants');

/**
 * Retrieves the current availability status of all staff members.
 */
exports.getAvailability = catchAsync(async (req, res) => {
  const availability = await store.listAvailability();
  res.json(availability);
});

/**
 * Updates the availability status and position of a specific staff member.
 * Recalculates ETAs because a change in active staff affects waiting times.
 */
exports.updateAvailability = catchAsync(async (req, res) => {
  const staffId = typeof req.body.staffId === 'string' ? req.body.staffId.trim() : '';
  const status = req.body.status;
  const position = typeof req.body.position === 'string' && req.body.position.trim() ? req.body.position.trim() : 'Default';

  if (!staffId) throwError('staffId required and must be string');

  if (!VALID_STAFF_STATUSES.includes(status)) throwError(`status must be one of: ${VALID_STAFF_STATUSES.join(', ')}`);

  const availability = await store.saveAvailability({ staffId, status, position });
  await queueService.updateAllETAs();

  res.json({ message: 'Updated', availability });
});

/**
 * Derives per-staff throughput from the queue store when Postgres is not in use.
 * WHY: the stats were SQL-only, so on the Redis-backed setup every staff card
 * rendered 0 processed / 0m — indistinguishable from "no work done yet".
 * @returns {Promise<Object>} Map of staff username to { processed, avgSeconds }.
 */
const computeStaffStatsFromStore = async () => {
  const leads = await store.listLeads(null, { includePending: true });
  const stats = {};

  leads.forEach((lead) => {
    if (lead.status !== 'Completed' || !lead.staff) return;

    const entry = stats[lead.staff] || (stats[lead.staff] = { processed: 0, totalSeconds: 0, timed: 0 });
    entry.processed += 1;

    // Mirrors the SQL: only sessions with a real serving window count towards the average.
    if (!lead.servingAt || !lead.completedAt) return;
    const seconds = (new Date(lead.completedAt).getTime() - new Date(lead.servingAt).getTime()) / 1000;
    if (seconds > 0) {
      entry.totalSeconds += seconds;
      entry.timed += 1;
    }
  });

  return Object.fromEntries(
    Object.entries(stats).map(([username, entry]) => [
      username,
      { processed: entry.processed, avgSeconds: entry.timed > 0 ? entry.totalSeconds / entry.timed : 0 }
    ])
  );
};

exports.getStaffAccounts = catchAsync(async (req, res) => {
  const accounts = await store.getAllStaffAccounts();
  let statsMap = {};

  if (store.usingDb()) {
    const pool = store.getPool();
    const statsResult = await pool.query(`
      SELECT staff, COUNT(*) as processed, COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - serving_at))), 0) as avg_time
      FROM leads WHERE status='Completed' AND staff IS NOT NULL GROUP BY staff
    `);
    statsResult.rows.forEach((row) => {
      statsMap[row.staff] = { processed: parseInt(row.processed, 10) || 0, avgSeconds: parseFloat(row.avg_time) || 0 };
    });
  } else {
    statsMap = await computeStaffStatsFromStore();
  }

  const enriched = accounts.map((acc) => {
    const stats = statsMap[acc.username] || { processed: 0, avgSeconds: 0 };
    return { ...acc, processedCount: stats.processed, avgResponseTime: stats.avgSeconds };
  });

  return res.json(enriched);
});

exports.createStaffAccount = catchAsync(async (req, res) => {
  const { username, password, displayName, service } = req.body;
  if (!username || !password || !displayName || !service) {
    throwError('Missing required fields');
  }
  // A staff member assigned to a service that does not exist can never be given
  // a customer, which is the staff-side twin of the phantom-service gap.
  const catalogService = await businessService.requireService(service);

  const existing = await store.getStaffAccount(username);
  if (existing) throwError('Username already exists', 400);

  await store.createStaffAccount({
    username,
    password,
    displayName,
    service: catalogService.name,
    role: 'staff'
  });
  res.json({ message: 'Created successfully' });
});

exports.updateStaffAccount = catchAsync(async (req, res) => {
  const username = req.params.username;
  const existing = await store.getStaffAccount(username);
  if (!existing) throwError('Account not found', 404);

  const patch = { ...req.body };
  if (patch.service !== undefined) {
    patch.service = (await businessService.requireService(patch.service)).name;
  }

  await store.updateStaffAccount(username, patch);
  res.json({ message: 'Updated successfully' });
});

exports.deleteStaffAccount = catchAsync(async (req, res) => {
  const username = req.params.username;
  await store.deleteStaffAccount(username);
  res.json({ message: 'Deleted successfully' });
});

// ── Service catalogue ───────────────────────────────

exports.listServices = catchAsync(async (_req, res) => {
  const [services, settings] = await Promise.all([
    store.listServices({ includeInactive: true }),
    businessService.getSettings()
  ]);

  res.json(services.map((service) => ({
    ...service,
    effectiveSlotCapacity: businessService.slotCapacityFor(service, settings)
  })));
});

exports.createService = catchAsync(async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name) throwError('A service name is required.');

  if (await store.getService(name)) throwError('A service with that name already exists.', 409);

  const created = await store.createService({
    name,
    description: req.body.description,
    counters: req.body.counters,
    slotCapacity: req.body.slotCapacity,
    isActive: req.body.isActive
  });

  res.status(201).json(created);
});

exports.updateService = catchAsync(async (req, res) => {
  const updated = await store.updateService(req.params.name, req.body);
  if (!updated) throwError('Service not found', 404);
  res.json(updated);
});

exports.deleteService = catchAsync(async (req, res) => {
  const service = await store.getService(req.params.name);
  if (!service) throwError('Service not found', 404);

  // Deleting a service with live tickets would strand them in a queue that no
  // longer exists, so retiring it is the only safe option at that point.
  const leads = await store.listLeads(service.name, { includePending: true });
  const live = leads.filter((lead) => LIVE_LEAD_STATUSES.includes(lead.status) || lead.status === 'Pending');

  if (live.length > 0) {
    const retired = await store.updateService(service.name, { isActive: false });
    return res.json({
      message: `${live.length} ticket(s) are still open for this service, so it was deactivated instead of deleted. It will stop appearing to customers immediately.`,
      service: retired,
      deactivated: true
    });
  }

  await store.deleteService(service.name);
  res.json({ message: 'Service deleted', deactivated: false });
});

// ── Operating settings ─────────────────────────────

exports.getSettings = catchAsync(async (_req, res) => {
  res.json(await businessService.getSettings());
});

exports.updateSettings = catchAsync(async (req, res) => {
  if (req.body.openTime && businessService.parseClock(req.body.openTime) === null) {
    throwError('openTime must look like 08:00');
  }
  if (req.body.closeTime && businessService.parseClock(req.body.closeTime) === null) {
    throwError('closeTime must look like 17:00');
  }

  // A patch may change only one end of the day, so the other end is read back
  // from the stored settings before the two are compared.
  const current = await businessService.getSettings();
  const open = businessService.parseClock(req.body.openTime || current.openTime);
  const close = businessService.parseClock(req.body.closeTime || current.closeTime);
  if (open !== null && close !== null && close <= open) {
    throwError('closeTime must be later than openTime');
  }

  const saved = await store.saveBusinessSettings(req.body);
  res.json(saved);
});

// ── AI model ────────────────────────────────────────────────────────────────

exports.getModelStatus = catchAsync(async (_req, res) => {
  const [status, samples] = await Promise.all([
    aiService.getModelStatus(),
    aiService.buildTrainingSamples()
  ]);
  res.json({ ...status, availableSamples: samples.length });
});

exports.trainModel = catchAsync(async (_req, res) => {
  const report = await aiService.trainModel();
  if (!report) {
    const samples = await aiService.buildTrainingSamples();
    return res.status(202).json({
      trained: false,
      availableSamples: samples.length,
      message: 'Not enough served tickets yet, or the AI engine is unreachable. The analytic estimate stays in use.'
    });
  }
  res.json({ trained: true, ...report });
});
