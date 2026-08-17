const catchAsync = require('../utils/catchAsync');
const { generateToken } = require('../middleware/auth');
const { safeCompare } = require('../utils/crypto');
const config = require('../config');
const log = require('../utils/logger');
const store = require('../store');

const { throwError } = require('../utils/AppError');
/**
 * Issues a token for a customer based on their ticket number.
 */
const issueTicketToken = async (ticketNumber, res) => {
  const normalizedTicket = String(ticketNumber || '').trim();
  if (!normalizedTicket) throwError('ticketNumber required');

  const lead = await store.getLeadByTicket(normalizedTicket);
  if (!lead) throwError('Ticket not found', 404);

  res.json({
    token: generateToken(lead.id, 'customer', { ticketNumber: lead.ticketNumber }),
    lead: store.publicLead(lead)
  });
};

/**
 * Handles login for admin and staff users.
 */
exports.login = catchAsync(async (req, res) => {
  const { userType, username, password, pin } = req.body;

  if (userType === 'admin') {
    if (safeCompare(username, config.ADMIN_USERNAME) && safeCompare(password, config.ADMIN_PASSWORD)) {
      log.info('auth:admin:success', { username });
      return res.json({ token: generateToken(username, 'admin'), userType: 'admin' });
    }
    log.warn('auth:admin:fail', { username });
    throwError('Invalid admin credentials', 401);
  }

  if (userType === 'staff') {
    // New: per-account username/password authentication
    if (username && password) {
      const staffAccount = await store.getStaffAccount(username);
      if (staffAccount && safeCompare(password, staffAccount.password) && staffAccount.isActive) {
        log.info('auth:staff:success', { username: staffAccount.username, service: staffAccount.service });
        return res.json({
          token: generateToken(staffAccount.username, 'staff', {
            displayName: staffAccount.displayName,
            service: staffAccount.service
          }),
          userType: 'staff',
          displayName: staffAccount.displayName,
          service: staffAccount.service
        });
      }
      log.warn('auth:staff:fail', { username });
      throwError('Invalid staff credentials or account disabled', 401);
    }

    // Legacy: shared PIN fallback
    if (pin && safeCompare(pin, config.STAFF_PIN)) {
      const staffName = typeof username === 'string' && username.trim() ? username.trim() : 'staff';
      log.info('auth:staff:pin:success', { staffName });
      return res.json({ token: generateToken(staffName, 'staff'), userType: 'staff' });
    }
    log.warn('auth:staff:fail');
    throwError('Invalid staff credentials', 401);
  }

  throwError('Unsupported userType');
});

/**
 * Specific endpoint for issuing customer tokens.
 */
exports.getTicketToken = catchAsync(async (req, res) => {
  await issueTicketToken(req.body.ticketNumber, res);
});

/**
 * Legacy or combined endpoint for issuing customer tokens.
 */
exports.getToken = catchAsync(async (req, res) => {
  if (req.body.ticketNumber) {
    return await issueTicketToken(req.body.ticketNumber, res);
  }
  throwError('Use /api/auth/login for staff/admin or provide ticketNumber for customer tracking.');
});
