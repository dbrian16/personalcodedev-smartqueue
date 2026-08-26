module.exports = {
  VALID_LEAD_STATUSES: ['Pending', 'Waiting', 'Called', 'Serving', 'Completed', 'No-Show', 'Cancelled'],
  // Transitions a client may request through PATCH /api/leads/:id.
  // Internal flows (check-in, transfer, call-next, expiry) drive the store directly.
  LEAD_STATUS_TRANSITIONS: {
    Pending: ['Waiting', 'Cancelled'],
    Waiting: ['Called', 'Cancelled'],
    Called: ['Serving', 'No-Show', 'Cancelled'],
    Serving: ['Completed', 'No-Show', 'Cancelled'],
    Completed: [],
    'No-Show': ['Waiting', 'Cancelled'],
    Cancelled: []
  },
  // Statuses that still occupy a slot / count against a customer's ticket cap.
  ACTIVE_LEAD_STATUSES: ['Pending', 'Waiting', 'Called', 'Serving'],
  // Statuses shown on the kiosk board and to staff.
  LIVE_LEAD_STATUSES: ['Waiting', 'Called', 'Serving'],
  VALID_STAFF_STATUSES: ['online', 'busy', 'offline'],
  // Statuses that mean "this person can take a customer right now", so they
  // count towards the staffing figure behind every wait-time estimate.
  ACTIVE_STAFF_STATUSES: ['online', 'busy', 'serving', 'active'],
  EXPIRE_CHECK_INTERVAL_MS: 30000,
  REDIS_CONNECT_MAX_ATTEMPTS: 5,
  REDIS_CONNECT_RETRY_DELAY_MS: 500,
  REDIS_CONNECT_TIMEOUT_MS: 5000,
  // QUEUE_STORE=auto only needs to learn whether a Redis is listening; waiting the
  // full connect timeout for an answer nobody is going to give delays every boot.
  REDIS_PROBE_TIMEOUT_MS: 1200,
  REDIS_RECONNECT_DELAY_STEP_MS: 200,
  REDIS_RECONNECT_DELAY_MAX_MS: 3000,
  // A held lock is renewed this many times before its TTL would elapse.
  LOCK_RENEWALS_PER_TTL: 3,
  LOCK_RENEW_MIN_INTERVAL_MS: 100,
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
  RATE_LIMIT_GENERAL_MAX: 3000,
  RATE_LIMIT_AUTH_MAX: 1000,
  RATE_LIMIT_PUBLIC_MAX: 1000,
  RATE_LIMIT_LOOKUP_MAX: 30,

  /**
   * Operating policy. These are seed values only: they are written to the
   * settings store on first boot and are editable from the admin screen
   * afterwards, so changing policy never means changing code.
   */
  DEFAULT_BUSINESS_SETTINGS: {
    // Fixed opening hours for the whole centre; 30-minute appointment slots
    openDays: [0, 1, 2, 3, 4, 5, 6],
    openTime: '00:00',
    closeTime: '23:59',
    holidays: [],
    slotMinutes: 30,
    // Book at most 7 days ahead
    bookingHorizonDays: 7,
    // Stop issuing new tickets before closing so everyone already waiting is served
    lastTicketBeforeCloseMinutes: 30,
    // Check in from 30 minutes before the appointment
    checkinEarliestMinutes: 30,
    // Grace after the appointment before the ticket stops being "on time"
    checkinGraceMinutes: 15,
    // After the grace period, downgrade to a walk-in for this long instead of
    // cancelling outright; only then treat the ticket as abandoned
    lateDowngradeWindowMinutes: 120,
    // Automatic no-show 5 minutes after being called
    calledTimeoutMinutes: 5,
    // Two recalls, then automatic no-show
    maxRecalls: 2,
    // Alert an administrator after 45 minutes; never auto-close a session
    longSessionAlertMinutes: 45,
    // One live ticket per service, across at most two services
    maxActiveTicketsPerService: 1,
    maxActiveServicesPerCustomer: 2,
    // Brute-force guard on the check-in identifier
    maxCheckinFailures: 5,
    checkinLockoutMinutes: 15,
    // Slot capacity derives from the counters staffing that service
    slotCapacityPerCounter: 1,
    // A counter may cover another service line, but only by asking for it
    // explicitly, and the fact is recorded.
    allowCrossCounterCalls: true,
    // The kiosk asks for a phone number but lets a customer skip it.
    // Skipping means ticket lookup and the per-customer cap cannot apply to them.
    requireKioskPhone: false,
    // A ticket issued yesterday must not be sitting at the front of today's
    // queue. Set true only if the centre genuinely runs overnight.
    carryOverWaitingTickets: false,
  },
  SETTINGS_KEY_BUSINESS: 'business'
};
