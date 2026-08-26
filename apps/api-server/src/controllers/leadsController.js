const catchAsync = require('../utils/catchAsync');
const store = require('../store');
const socket = require('../socket');
const queueService = require('../services/queueService');
const businessService = require('../services/businessService');
const aiService = require('../services/aiService');
const { validateEmail, validatePhone, nowUtc } = require('../utils/validators');
const { generateToken } = require('../middleware/auth');
const { withQueueLock } = require('../utils/redlock');
const { assertMayActOnLead, noteCoverage } = require('../services/staffAccessService');
const {
  VALID_LEAD_STATUSES,
  LEAD_STATUS_TRANSITIONS,
  ACTIVE_LEAD_STATUSES
} = require('../config/constants');

const { throwError } = require('../utils/AppError');

/** Statuses a transfer may start from. */
const TRANSFERABLE_STATUSES = ['Called', 'Serving'];

/** Statuses a customer may still walk away from. */
const CUSTOMER_CANCELLABLE_STATUSES = ['Pending', 'Waiting'];

/**
 * Lists leads with pagination and position filtering.
 */
exports.listLeads = catchAsync(async (req, res) => {
  const position = req.query.position ? String(req.query.position) : null;
  const includePending = req.user.userType !== 'customer' && String(req.query.includePending || '') === 'true';
  const filteredLeads = await store.listLeads(position, { includePending });

  if (req.user.userType === 'customer') {
    if (!position) throwError('Customer access requires a position filter', 403);
    return res.json(filteredLeads.map(store.publicLead));
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 200));
  const total = filteredLeads.length;
  const paged = filteredLeads.slice((page - 1) * limit, page * limit);

  if (req.query.page || req.query.limit) {
    return res.json({ data: paged, total, page, limit, totalPages: Math.ceil(total / limit) });
  }

  res.json(filteredLeads);
});

/**
 * Tracks a specific lead by ticket number.
 */
exports.trackLead = catchAsync(async (req, res) => {
  const lead = await store.getLeadByTicket(req.params.ticketNumber);
  if (!lead) throwError('Ticket not found', 404);

  res.json({
    ...store.publicLead(lead),
    token: generateToken(lead.id, 'customer', { ticketNumber: lead.ticketNumber })
  });
});

/**
 * Finds a customer's live tickets from the contact details they booked with, so
 * a lost ticket number does not mean a lost place in the queue.
 */
exports.lookupLeads = catchAsync(async (req, res) => {
  const identifier = typeof req.body.identifier === 'string' ? req.body.identifier.trim() : '';
  if (!identifier) throwError('Enter the email address or phone number you booked with.');

  const looksLikeEmail = identifier.includes('@');
  if (looksLikeEmail && !validateEmail(identifier)) throwError('That email address does not look valid.');
  if (!looksLikeEmail && !validatePhone(identifier)) throwError('That phone number does not look valid.');

  const leads = await store.listActiveLeadsByContact(
    looksLikeEmail ? { email: identifier } : { phone: identifier }
  );

  res.json({
    count: leads.length,
    tickets: leads.map((lead) => ({
      ...store.publicLead(lead),
      token: generateToken(lead.id, 'customer', { ticketNumber: lead.ticketNumber })
    }))
  });
});

/**
 * Creates a new lead (on-site kiosk ticket).
 */
exports.createLead = catchAsync(async (req, res) => {
  const { email, phone, service, staff } = req.body;
  const normalizedService = typeof service === 'string' ? service.trim() : '';

  if (!normalizedService) throwError('Missing required field: service');
  if (email && !validateEmail(email)) throwError('Invalid email format');
  if (req.body.source === 'Remote') {
    throwError('Use /api/online/book for remote reservations');
  }

  const settings = await businessService.getSettings();

  // The kiosk asks for a phone number but a customer in a hurry may
  // skip it. Anyone who gives one gets ticket lookup and the duplicate check;
  // anyone who does not is anonymous and neither can apply to them. A number that
  // is supplied still has to be a real one.
  const hasPhone = typeof phone === 'string' && phone.trim().length > 0;
  if (settings.requireKioskPhone && !hasPhone) {
    throwError('A phone number is required to take a ticket.');
  }
  if (hasPhone && !validatePhone(phone)) {
    throwError('Invalid phone format (min 7 digits)');
  }

  const catalogService = await businessService.requireService(normalizedService);
  await businessService.assertAcceptingWalkIns();

  if (hasPhone || email) {
    await businessService.assertCustomerCanHoldAnother({
      email,
      phone: hasPhone ? phone : undefined,
      service: catalogService.name
    });
  }

  const created = await withQueueLock('queue:global', {}, async () => {
    const waitingForPosition = (await store.listLeads(catalogService.name))
      .filter((lead) => lead.status === 'Waiting').length;

    const prediction = await aiService.getAIWaitPrediction(waitingForPosition, catalogService.name);
    const modelContext = await aiService.captureModelContext(catalogService.name, waitingForPosition);
    const now = nowUtc();

    const newLead = await store.createLead({
      // Empty rather than a fabricated address: an anonymous ticket should read as
      // anonymous, not as a contact detail that looks real and matches nothing.
      email: email ? String(email).trim().toLowerCase() : '',
      phone: hasPhone ? String(phone).trim() : '',
      service: catalogService.name,
      staff: typeof staff === 'string' && staff.trim() ? staff.trim() : null,
      source: 'On-site',
      status: 'Waiting',
      priority: false,
      predictedWaitTime: prediction.estimatedWaitTimeMins,
      queueStatus: prediction.queueStatus,
      assignedPosition: catalogService.name,
      timestamp: now,
      effectiveQueueTime: now,
      ...modelContext
    });

    await queueService.updateAllETAs();
    return (await store.getLeadById(newLead.id)) || newLead;
  });

  const token = generateToken(created.id, 'customer', { ticketNumber: created.ticketNumber });
  socket.broadcastLead(store.publicLead(created), 'new_lead');
  res.status(201).json({ ...created, token });
});

/**
 * Updates an existing lead's status, tags, or notes.
 */
exports.updateLead = catchAsync(async (req, res) => {
  await withQueueLock(`queue:lead:${req.params.id}`, {}, async () => {
    const lead = await store.getLeadById(req.params.id);
    if (!lead) throwError('Lead not found', 404);

    const oldStatus = lead.status;
    const newStatus = req.body.status;

    if (newStatus && !VALID_LEAD_STATUSES.includes(newStatus)) {
      throwError(`Invalid status. Must be one of: ${VALID_LEAD_STATUSES.join(', ')}`);
    }

    if (newStatus && oldStatus !== newStatus) {
      // Without this, a ticket could jump straight from Waiting to Completed and
      // record completedAt with no servingAt, which corrupts service-time stats.
      const allowedNext = LEAD_STATUS_TRANSITIONS[oldStatus] || [];
      if (!allowedNext.includes(newStatus)) {
        throwError(
          `Cannot change status from ${oldStatus} to ${newStatus}`
          + (allowedNext.length > 0 ? `. Allowed: ${allowedNext.join(', ')}` : '. This ticket is final.'),
          409
        );
      }

      // Covering another counter is allowed, but has to be asked for.
      const covering = assertMayActOnLead(req.user, lead, { coveringFor: !!req.body.coveringFor });
      if (covering) noteCoverage(req.user, lead.assignedPosition, `status:${newStatus}`, lead.ticketNumber);

      lead.status = newStatus;
      if (newStatus === 'Called') {
        lead.calledAt = nowUtc();
        lead.recallCount = 0;
      }
      if (newStatus === 'Serving') {
        lead.servingAt = nowUtc();
        lead.longSessionAlertedAt = undefined;
      }
      if (newStatus === 'Completed') lead.completedAt = nowUtc();
    }

    if (req.body.tags !== undefined) {
      if (!Array.isArray(req.body.tags)) throwError('tags must be an array');
      lead.tags = req.body.tags.map((tag) => String(tag).trim()).filter(Boolean);
    }

    if (req.body.notes !== undefined) {
      if (typeof req.body.notes !== 'string') throwError('notes must be a string');
      lead.notes = req.body.notes.trim();
    }

    const updatedLead = await queueService.saveAndBroadcastLead(lead);
    res.json(updatedLead);
  });
});

/**
 * Transfers a lead to another service line.
 *
 * Restricted to Called and Serving: transferring a Completed or Cancelled ticket
 * would erase its completion timestamp and push it back into a live queue.
 */
exports.transferLead = catchAsync(async (req, res) => {
  await withQueueLock(`queue:lead:${req.params.id}`, {}, async () => {
    const lead = await store.getLeadById(req.params.id);
    if (!lead) throwError('Lead not found', 404);

    if (!TRANSFERABLE_STATUSES.includes(lead.status)) {
      throwError(
        `Only ${TRANSFERABLE_STATUSES.join(' or ')} tickets can be transferred. This one is ${lead.status}.`,
        409
      );
    }

    const requested = typeof req.body.newService === 'string' ? req.body.newService.trim() : '';
    if (!requested) throwError('New service required and must be non-empty');

    const target = await businessService.requireService(requested);
    if (target.name.toLowerCase() === String(lead.assignedPosition).toLowerCase()) {
      throwError('That ticket is already in this service line.', 409);
    }

    lead.status = 'Waiting';
    lead.assignedPosition = target.name;
    lead.service = target.name;
    lead.staff = null;
    lead.calledAt = undefined;
    lead.servingAt = undefined;
    lead.completedAt = undefined;
    lead.longSessionAlertedAt = undefined;
    lead.recallCount = 0;
    // effectiveQueueTime is deliberately left untouched: the customer keeps the
    // wait they have already served and does not jump ahead of the new queue.

    const updatedLead = await queueService.saveAndBroadcastLead(lead);
    res.json(updatedLead);
  });
});

/**
 * Lets a customer release a ticket they no longer need.
 * Staff and admins may cancel on their behalf.
 */
exports.cancelLead = catchAsync(async (req, res) => {
  await withQueueLock(`queue:lead:${req.params.id}`, {}, async () => {
    const lead = await store.getLeadById(req.params.id);
    if (!lead) throwError('Ticket not found', 404);

    const isOwner = req.user.userType === 'customer'
      && (String(req.user.userId) === String(lead.id) || req.user.ticketNumber === lead.ticketNumber);

    if (req.user.userType === 'customer' && !isOwner) {
      throwError('You can only cancel your own ticket.', 403);
    }

    if (!ACTIVE_LEAD_STATUSES.includes(lead.status)) {
      throwError(`This ticket is already ${lead.status}.`, 409);
    }

    if (req.user.userType === 'customer' && !CUSTOMER_CANCELLABLE_STATUSES.includes(lead.status)) {
      throwError('Your ticket has already been called. Please speak to the counter.', 409);
    }

    const updated = await queueService.closeLead(
      lead,
      'Cancelled',
      req.user.userType === 'customer' ? 'cancelled_by_customer' : 'cancelled_by_staff'
    );

    await queueService.updateAllETAs();
    res.json(store.publicLead(updated));
  });
});
