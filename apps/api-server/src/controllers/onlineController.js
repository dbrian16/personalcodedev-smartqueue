const catchAsync = require('../utils/catchAsync');
const store = require('../store');
const socket = require('../socket');
const queueService = require('../services/queueService');
const businessService = require('../services/businessService');
const aiService = require('../services/aiService');
const otpService = require('../services/otpService');
const {
  validateEmail,
  validatePhone,
  maskEmail,
  maskPhone,
  normalizeEmailValue,
  normalizePhoneValue,
  toDateOrNull,
  nowUtc,
  addMinutes
} = require('../utils/validators');
const { safeCompare, hashValue } = require('../utils/crypto');
const { generateToken } = require('../middleware/auth');
const { withQueueLock } = require('../utils/redlock');
const log = require('../utils/logger');

const { throwError } = require('../utils/AppError');

const BOOKING_PURPOSE = 'online_booking';

// Location verification is not built. Check-in already requires the customer to be standing at the counter and
// to state the email or phone they booked with; GPS adds a permission prompt and
// poor indoor accuracy without adding assurance. Every attempt is still recorded
// in checkin_audit.

/** Statuses that mean the customer is already through the door. */
const CHECKED_IN_STATUSES = ['Waiting', 'Called', 'Serving'];

/**
 * The three boundaries of a reservation.
 * - opensAt      : earliest a customer may check in
 * - onTimeUntil  : the end of the grace period; past it the appointment is lost
 * - abandonAt    : past this the reservation is treated as a no-show
 */
const checkinWindow = (lead, settings) => {
  const appointment = toDateOrNull(lead.scheduledFor) || toDateOrNull(lead.timestamp) || nowUtc();
  const onTimeUntil = toDateOrNull(lead.pendingExpiresAt)
    || addMinutes(appointment, settings.checkinGraceMinutes);

  return {
    appointment,
    opensAt: addMinutes(appointment, -settings.checkinEarliestMinutes),
    onTimeUntil,
    abandonAt: addMinutes(onTimeUntil, settings.lateDowngradeWindowMinutes)
  };
};

/** Everything a booking needs, once it has passed every business rule. */
const validateBookingRequest = async (body) => {
  const { email, phone, service, scheduledFor } = body;
  const normalizedService = typeof service === 'string' ? service.trim() : '';

  if (!email || !phone || !normalizedService) {
    throwError('Missing required fields: email, phone, service');
  }
  if (!validateEmail(email)) throwError('Invalid email format');
  if (!validatePhone(phone)) throwError('Invalid phone format (min 7 digits)');

  const catalogService = await businessService.requireService(normalizedService);
  const { scheduledFor: appointment } = await businessService.validateBookingTime(catalogService, scheduledFor);
  await businessService.assertCustomerCanHoldAnother({
    email,
    phone,
    service: catalogService.name
  });

  return {
    email: String(email).trim().toLowerCase(),
    phone: String(phone).trim(),
    service: catalogService.name,
    scheduledFor: appointment.toISOString()
  };
};

/** Creates the Pending reservation once the request is fully validated. */
const createBooking = async (booking) => withQueueLock('queue:global', {}, async () => {
  // Re-check inside the lock: two people can pass validation for the last seat in
  // a slot at the same moment, and only one of them may have it.
  const catalogService = await businessService.requireService(booking.service);
  await businessService.validateBookingTime(catalogService, booking.scheduledFor);

  const waitingForPosition = (await store.listLeads(catalogService.name, { includePending: false }))
    .filter((lead) => lead.status === 'Waiting').length;

  const prediction = await aiService.getAIWaitPrediction(waitingForPosition, catalogService.name);
  const modelContext = await aiService.captureModelContext(catalogService.name, waitingForPosition);
  const timing = await queueService.computeOnlineTiming(booking.scheduledFor);

  const newLead = await store.createLead({
    email: booking.email,
    phone: booking.phone,
    service: catalogService.name,
    staff: null,
    source: 'Remote',
    status: 'Pending',
    priority: false,
    predictedWaitTime: prediction.estimatedWaitTimeMins,
    queueStatus: prediction.queueStatus,
    assignedPosition: catalogService.name,
    scheduledFor: timing.scheduledFor,
    pendingExpiresAt: timing.pendingExpiresAt,
    timestamp: timing.createdAt,
    // M6: a booking is ordered by its appointment, not by when it was created.
    effectiveQueueTime: timing.scheduledFor,
    ...modelContext
  });

  return { lead: (await store.getLeadById(newLead.id)) || newLead, timing };
});

/**
 * Handles online ticket booking.
 *
 * With verification enabled this is a two-step call: the first
 * request validates everything and issues a code, the second redeems it. The
 * validated booking travels inside the challenge, so the details cannot be
 * swapped between the two steps.
 */
exports.bookTicket = catchAsync(async (req, res) => {
  let booking;

  if (otpService.isEnabled() && req.body.challengeId) {
    booking = await otpService.verifyChallenge(req.body.challengeId, req.body.code, BOOKING_PURPOSE);
  } else {
    booking = await validateBookingRequest(req.body);

    if (otpService.isEnabled()) {
      const challenge = await otpService.requestChallenge({
        channel: 'phone',
        destination: booking.phone,
        purpose: BOOKING_PURPOSE,
        payload: booking
      });

      return res.status(202).json({
        verificationRequired: true,
        sentTo: maskPhone(booking.phone),
        ...challenge
      });
    }
  }

  const { lead: createdLead, timing } = await createBooking(booking);

  const customerToken = generateToken(createdLead.id, 'customer', {
    ticketNumber: createdLead.ticketNumber
  });

  socket.broadcastLead(store.publicLead(createdLead));

  res.status(201).json({
    lead: store.publicLead(createdLead),
    customerToken,
    ticketNumber: createdLead.ticketNumber,
    checkinOpensAt: timing.checkinOpensAt,
    pendingExpiresAt: timing.pendingExpiresAt
  });
});

/**
 * Publishes the appointment slots still open for a service, so the booking form
 * can offer real choices instead of letting customers pick a time that will be
 * rejected.
 */
exports.listAvailability = catchAsync(async (req, res) => {
  const service = await businessService.requireService(req.query.service);
  const settings = await businessService.getSettings();
  const now = nowUtc();

  const days = Math.min(
    settings.bookingHorizonDays,
    Math.max(1, parseInt(req.query.days, 10) || settings.bookingHorizonDays)
  );

  const capacity = businessService.slotCapacityFor(service, settings);
  const openMinutes = businessService.parseClock(settings.openTime) ?? 0;
  const closeMinutes = businessService.parseClock(settings.closeTime) ?? 24 * 60;
  const result = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    day.setHours(0, 0, 0, 0);

    if (!businessService.isBusinessDay(day, settings)) continue;

    const slots = [];
    for (let minute = openMinutes; minute < closeMinutes; minute += settings.slotMinutes) {
      const start = new Date(day);
      start.setMinutes(minute);
      if (start.getTime() <= now.getTime()) continue;

      const end = addMinutes(start, settings.slotMinutes);
      const taken = await store.countBookingsInSlot(service.name, start, end);

      slots.push({
        start: start.toISOString(),
        label: businessService.formatClock(minute),
        remaining: Math.max(0, capacity - taken),
        capacity
      });
    }

    if (slots.length > 0) {
      result.push({ date: businessService.localDateKey(day), slots });
    }
  }

  res.json({ service: service.name, slotMinutes: settings.slotMinutes, days: result });
});

/**
 * Verifies if an online ticket is valid and ready for check-in.
 */
exports.verifyCheckin = catchAsync(async (req, res) => {
  const ticketNumber = typeof req.body.ticketNumber === 'string' ? req.body.ticketNumber.trim() : '';
  if (!ticketNumber) throwError('Missing ticket number.');

  const lead = await store.getLeadByTicket(ticketNumber);
  if (!lead) throwError('Ticket number does not exist.', 404);
  if (lead.source !== 'Remote') throwError('This is not an online ticket.');
  if (lead.status === 'Cancelled') throwError('Ticket has been cancelled or expired.');

  // Pressing check-in twice reports the success again rather than an error.
  if (CHECKED_IN_STATUSES.includes(lead.status)) {
    return res.json({
      ticketNumber: lead.ticketNumber,
      status: lead.status,
      alreadyCheckedIn: true,
      message: 'You are already checked in.'
    });
  }

  if (lead.status !== 'Pending') {
    throwError(`Ticket is not in pending check-in status (current: ${lead.status}).`);
  }

  const settings = await businessService.getSettings();
  const window = checkinWindow(lead, settings);
  const now = nowUtc();

  if (now.getTime() < window.opensAt.getTime()) {
    throwError(
      `Check-in opens ${settings.checkinEarliestMinutes} minutes before your appointment, at ${window.opensAt.toLocaleTimeString()}.`,
      409
    );
  }

  if (now.getTime() > window.abandonAt.getTime()) {
    await queueService.closeLead(lead, 'Cancelled', 'reservation_abandoned');
    throwError('This reservation has expired. Please book again or take a walk-in ticket.', 410);
  }

  res.json({
    ticketNumber: lead.ticketNumber,
    status: lead.status,
    scheduledFor: lead.scheduledFor,
    checkinOpensAt: window.opensAt,
    pendingExpiresAt: lead.pendingExpiresAt,
    late: now.getTime() > window.onTimeUntil.getTime()
  });
});

/**
 * Performs check-in for an online ticket upon arrival.
 */
exports.performCheckin = catchAsync(async (req, res) => {
  const ticketNumber = typeof req.body.ticketNumber === 'string' ? req.body.ticketNumber.trim() : '';
  const identifierRaw = typeof req.body.identifier === 'string' ? req.body.identifier.trim() : '';

  if (!ticketNumber) throwError('Missing ticket number.');
  if (!identifierRaw) throwError('Missing identification info (email or phone number).');

  const settings = await businessService.getSettings();
  const ip = req.headers['x-forwarded-for']
    ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
    : req.ip;
  const userAgent = req.headers['user-agent'] ? String(req.headers['user-agent']) : '';

  const looksLikeEmail = identifierRaw.includes('@');
  const identifierType = looksLikeEmail ? 'email' : 'phone';
  const identifierHash = hashValue(identifierRaw);
  const identifierMask = looksLikeEmail ? maskEmail(identifierRaw) : maskPhone(identifierRaw);
  const auditBase = { identifierType, identifierHash, identifierMask, ip, userAgent };

  // Failures are counted, not just logged: without a lockout another customer's
  // contact details can be guessed by brute force one attempt at a time.
  const lockScope = `${ticketNumber.toLowerCase()}:${hashValue(ip)}`;
  const lockedFor = await store.getCheckinLockoutSeconds(lockScope, settings.maxCheckinFailures);
  if (lockedFor > 0) {
    await store.recordCheckinAudit({ ...auditBase, ticketNumber, success: false, reason: 'locked_out' });
    throwError(
      `Too many failed attempts. Please try again in ${Math.ceil(lockedFor / 60)} minutes or ask a staff member for help.`,
      429
    );
  }

  const failAndThrow = async (reason, message, statusCode = 400, options = {}) => {
    await store.recordCheckinAudit({ ...auditBase, ticketNumber, success: false, reason });
    if (options.countAsFailure) {
      await store.registerCheckinFailure(lockScope, settings.checkinLockoutMinutes);
    }
    throwError(message, statusCode);
  };

  const result = await withQueueLock(`queue:ticket:${ticketNumber.toLowerCase()}`, {}, async () => {
    const lead = await store.getLeadByTicket(ticketNumber);

    if (!lead) await failAndThrow('not_found', 'Ticket number does not exist.', 404, { countAsFailure: true });
    if (lead.source !== 'Remote') await failAndThrow('not_online_ticket', 'This is not an online ticket.');

    if (CHECKED_IN_STATUSES.includes(lead.status)) {
      // Idempotent: a second press is a success, not an error.
      return { lead, alreadyCheckedIn: true };
    }

    if (lead.status !== 'Pending') {
      await failAndThrow('invalid_status:' + lead.status, `Ticket is not awaiting check-in (current: ${lead.status}).`);
    }

    const now = nowUtc();
    const window = checkinWindow(lead, settings);

    // There was never a lower bound, so a 2:00 pm appointment could
    // check in at 8:00 am and occupy the live queue for six hours.
    if (now.getTime() < window.opensAt.getTime()) {
      await failAndThrow(
        'too_early',
        `Check-in opens ${settings.checkinEarliestMinutes} minutes before your appointment.`,
        409
      );
    }

    if (now.getTime() > window.abandonAt.getTime()) {
      await queueService.closeLead(lead, 'Cancelled', 'reservation_abandoned');
      await failAndThrow('reservation_abandoned', 'This reservation has expired. Please book again.', 410);
    }

    const inputEmail = looksLikeEmail ? normalizeEmailValue(identifierRaw) : '';
    const inputPhone = looksLikeEmail ? '' : normalizePhoneValue(identifierRaw);
    const matchedEmail = inputEmail && safeCompare(inputEmail, normalizeEmailValue(lead.email));
    const matchedPhone = inputPhone && safeCompare(inputPhone, normalizePhoneValue(lead.phone));

    if (!matchedEmail && !matchedPhone) {
      await failAndThrow(
        'identifier_mismatch',
        'Identification information mismatch (email/phone number).',
        401,
        { countAsFailure: true }
      );
    }

    // Past the grace period the appointment benefit is lost, but a customer who
    // has already travelled here is served as a walk-in rather than turned away.
    const isLate = now.getTime() > window.onTimeUntil.getTime();

    lead.status = 'Waiting';
    lead.priority = false;
    lead.checkedInAt = now;
    lead.walkInDowngraded = isLate;
    // M6: on time keeps the appointment's place; late is ordered by arrival.
    lead.effectiveQueueTime = isLate ? now : new Date(Math.max(window.appointment.getTime(), now.getTime()));

    const updated = await queueService.saveAndBroadcastLead(lead);
    await store.clearCheckinFailures(lockScope);
    await store.recordCheckinAudit({
      ...auditBase,
      ticketNumber: updated.ticketNumber,
      success: true,
      reason: matchedEmail ? 'matched_email' : 'matched_phone'
    });

    if (isLate) {
      log.info('checkin:late_downgrade', { ticketNumber: updated.ticketNumber });
    }

    return { lead: updated, alreadyCheckedIn: false, downgraded: isLate };
  });

  const customerToken = generateToken(result.lead.id, 'customer', {
    ticketNumber: result.lead.ticketNumber
  });

  res.json({
    lead: store.publicLead(result.lead),
    customerToken,
    alreadyCheckedIn: !!result.alreadyCheckedIn,
    downgradedToWalkIn: !!result.downgraded,
    message: result.downgraded
      ? 'You arrived after your appointment window, so your ticket was converted to a walk-in and is ordered by arrival time.'
      : undefined
  });
});
