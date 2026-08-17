/**
 * Who may act on which service line.
 *
 * WHY it is not a hard block: the service used to come from the browser and was
 * never compared against the signed-in staff member's assignment, so counter A
 * could silently call counter B's customers. Cover is kept possible — staff do
 * stand in for each other — but made deliberate rather than accidental: the
 * client has to ask for it, and the fact is recorded.
 *
 * Lives in its own module because both the staff console and the ticket
 * controller enforce the same rule, and neither should import the other.
 */
const { throwError } = require('../utils/AppError');
const log = require('../utils/logger');
const socket = require('../socket');

/**
 * @param {Object} user - Decoded token of the caller.
 * @param {string} position - The service line being acted on.
 * @param {{coveringFor?: boolean}} [options]
 * @returns {boolean} True when this was a cross-counter action.
 */
const assertMayServe = (user, position, options = {}) => {
  if (user.userType === 'admin') return false;
  if (!user.service) return false; // PIN-only legacy session: no assignment to enforce.
  if (String(user.service).toLowerCase() === String(position).toLowerCase()) return false;

  if (!options.coveringFor) {
    throwError(
      `This queue belongs to ${position}, and your counter is assigned to ${user.service}. `
      + 'Switch counters explicitly if you are covering for it.',
      403
    );
  }

  return true;
};

/**
 * The same rule, for an action on one specific ticket.
 *
 * A staff member who has already taken a covered ticket owns it: refusing them a
 * recall, a no-show or a completion afterwards would strand exactly the ticket
 * they picked up.
 * @returns {boolean} True when this was a cross-counter action.
 */
const assertMayActOnLead = (user, lead, options = {}) => {
  const isHolder = lead.staff && String(lead.staff) === String(user.userId);
  if (isHolder) return false;
  return assertMayServe(user, lead.assignedPosition, options);
};

/**
 * Records a cross-counter action, so "who covered for whom" survives the shift.
 * Per-staff throughput already comes from the ticket, which carries the staff id;
 * this is the trail for the *assignment* being crossed.
 */
const noteCoverage = (user, position, action, ticketNumber) => {
  const entry = {
    staff: String(user.userId || 'staff'),
    assignedTo: user.service,
    coveredService: position,
    action,
    ticketNumber
  };
  log.info('staff:cross_counter', entry);
  socket.emitToAdmins('staff_cross_counter', { ...entry, at: new Date().toISOString() });
};

module.exports = { assertMayServe, assertMayActOnLead, noteCoverage };
