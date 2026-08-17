/**
 * Business rules.
 *
 * Everything the backend used to take on trust lives here: whether a service
 * exists, whether the centre is open, whether a slot still has room, and how far
 * ahead a customer may book. Before this, the service name was free text, a
 * 3:00 am Sunday booking succeeded, and the only overload guard measured the
 * queue at the moment of booking rather than the slot being booked.
 */
const store = require('../store');
const { throwError } = require('../utils/AppError');
const { toDateOrNull, addMinutes, nowUtc } = require('../utils/validators');

const MINUTES_PER_DAY = 24 * 60;

/** '08:00' → 480. Returns null for anything that is not HH:MM. */
const parseClock = (value) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const minutesIntoDay = (date) => date.getHours() * 60 + date.getMinutes();

/** Local calendar date as YYYY-MM-DD — the form holidays are stored in. */
const localDateKey = (date) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const getSettings = () => store.getBusinessSettings();

const isBusinessDay = (date, settings) => {
  if (settings.holidays.includes(localDateKey(date))) return false;
  return settings.openDays.includes(date.getDay());
};

/**
 * @returns {{open: boolean, reason?: string, opensAt?: number, closesAt?: number}}
 */
const describeOpening = (date, settings) => {
  const opensAt = parseClock(settings.openTime) ?? 0;
  const closesAt = parseClock(settings.closeTime) ?? MINUTES_PER_DAY;

  if (!isBusinessDay(date, settings)) {
    return { open: false, reason: 'closed_day', opensAt, closesAt };
  }

  const minute = minutesIntoDay(date);
  if (minute < opensAt) return { open: false, reason: 'before_opening', opensAt, closesAt };
  if (minute >= closesAt) return { open: false, reason: 'after_closing', opensAt, closesAt };
  return { open: true, opensAt, closesAt };
};

const formatClock = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

/**
 * Confirms the requested service is one the centre actually runs.
 * @returns {Promise<Object>} The catalogue entry.
 */
const requireService = async (name) => {
  const normalized = typeof name === 'string' ? name.trim() : '';
  if (!normalized) throwError('A service is required.');

  const service = await store.getService(normalized);
  if (!service) throwError(`"${normalized}" is not a service this centre offers.`, 404);
  if (!service.isActive) throwError(`"${service.name}" is not currently available.`, 409);

  return service;
};

/**
 * Walk-in cut-off: stop issuing new tickets shortly
 * before closing so everyone already holding one can still be served.
 */
const assertAcceptingWalkIns = async (at = nowUtc()) => {
  const settings = await getSettings();
  const opening = describeOpening(at, settings);

  if (!opening.open) {
    const message = opening.reason === 'closed_day'
      ? 'The centre is closed today.'
      : `The centre is open ${formatClock(opening.opensAt)}–${formatClock(opening.closesAt)}.`;
    throwError(message, 409);
  }

  const lastTicketAt = opening.closesAt - settings.lastTicketBeforeCloseMinutes;
  if (minutesIntoDay(at) >= lastTicketAt) {
    throwError(
      `New tickets stop at ${formatClock(lastTicketAt)} so everyone already waiting can be served before ${formatClock(opening.closesAt)}.`,
      409
    );
  }

  return settings;
};

/** The appointment slot containing `date`, aligned to the configured granularity. */
const slotBounds = (date, slotMinutes) => {
  const start = new Date(date);
  start.setSeconds(0, 0);
  start.setMinutes(Math.floor(start.getMinutes() / slotMinutes) * slotMinutes);
  return { start, end: addMinutes(start, slotMinutes) };
};

/**
 * How many appointments one slot accepts: derived from the
 * counters staffing that service, unless an administrator pinned an explicit number.
 */
const slotCapacityFor = (service, settings) =>
  service.slotCapacity !== null && service.slotCapacity !== undefined
    ? service.slotCapacity
    : Math.max(1, service.counters * settings.slotCapacityPerCounter);

/**
 * Validates a requested appointment time against opening hours, the booking
 * horizon and the capacity of the slot it falls in.
 * @returns {Promise<{settings: Object, scheduledFor: Date, slot: {start: Date, end: Date}}>}
 */
const validateBookingTime = async (service, scheduledForRaw, at = nowUtc()) => {
  const settings = await getSettings();
  const requested = toDateOrNull(scheduledForRaw);

  // No time given means "as soon as possible", which is a walk-in-style booking
  // and only needs the centre to be open right now.
  const scheduledFor = requested || at;

  if (requested && requested.getTime() < at.getTime()) {
    // Previously this was silently moved to "now", so the customer believed they
    // held a 9:00 am slot while the system held one for the present moment.
    throwError('That appointment time is already in the past. Please choose a later time.');
  }

  const horizonEnd = addMinutes(at, settings.bookingHorizonDays * MINUTES_PER_DAY);
  if (scheduledFor.getTime() > horizonEnd.getTime()) {
    throwError(`Appointments can be booked up to ${settings.bookingHorizonDays} days ahead.`);
  }

  const opening = describeOpening(scheduledFor, settings);
  if (!opening.open) {
    const message = opening.reason === 'closed_day'
      ? 'The centre is closed on that date.'
      : `Please choose a time between ${formatClock(opening.opensAt)} and ${formatClock(opening.closesAt)}.`;
    throwError(message);
  }

  const slot = slotBounds(scheduledFor, settings.slotMinutes);
  const capacity = slotCapacityFor(service, settings);
  const taken = await store.countBookingsInSlot(service.name, slot.start, slot.end);

  if (taken >= capacity) {
    throwError(
      `The ${formatClock(minutesIntoDay(slot.start))} slot for ${service.name} is fully booked. Please choose another time.`,
      409
    );
  }

  return { settings, scheduledFor, slot };
};

/**
 * Per-customer ticket cap: one live ticket per service,
 * across at most two services. Without it one person — or one script — could hold
 * every slot of a session.
 */
const assertCustomerCanHoldAnother = async ({ email, phone, service }) => {
  const settings = await getSettings();
  const active = await store.listActiveLeadsByContact({ email, phone });
  if (active.length === 0) return;

  const sameService = active.filter(
    (lead) => String(lead.assignedPosition).toLowerCase() === String(service).toLowerCase()
  );
  if (sameService.length >= settings.maxActiveTicketsPerService) {
    throwError(
      `You already hold ticket ${sameService[0].ticketNumber} for ${service}. Please use or cancel it before taking another.`,
      409
    );
  }

  const distinctServices = new Set(active.map((lead) => String(lead.assignedPosition).toLowerCase()));
  if (distinctServices.size >= settings.maxActiveServicesPerCustomer) {
    throwError(
      `You can hold tickets for at most ${settings.maxActiveServicesPerCustomer} services at a time.`,
      409
    );
  }
};

module.exports = {
  parseClock,
  formatClock,
  localDateKey,
  minutesIntoDay,
  getSettings,
  isBusinessDay,
  describeOpening,
  requireService,
  assertAcceptingWalkIns,
  slotBounds,
  slotCapacityFor,
  validateBookingTime,
  assertCustomerCanHoldAnother
};
