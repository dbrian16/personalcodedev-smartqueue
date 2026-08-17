/* eslint-env jest */
/**
 * Online booking, verification and check-in.
 */
const { app, store, request, setup, resetQueue } = require('./helpers');

const SERVICE = 'General Inquiry';
const EMAIL = 'remote.customer@example.com';
const PHONE = '0987654321';

/** A slot at 10:00 on a chosen number of days from now. */
const slotInDays = (days, hour = 10) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const book = (payload) => request(app).post('/api/online/book').send(payload);

/** Runs the two-step verified booking and returns the created ticket. */
const bookVerified = async (payload) => {
  const step1 = await book(payload);
  expect(step1.status).toBe(202);
  const step2 = await book({ challengeId: step1.body.challengeId, code: step1.body.devCode });
  expect(step2.status).toBe(201);
  return step2.body;
};

beforeAll(setup);
beforeEach(resetQueue);

describe('booking rules', () => {
  test('a time in the past is refused instead of silently moved to now', async () => {
    const response = await book({
      email: EMAIL, phone: PHONE, service: SERVICE,
      scheduledFor: new Date(Date.now() - 3600_000).toISOString()
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/in the past/i);
  });

  test('a booking beyond the horizon is refused', async () => {
    const response = await book({
      email: EMAIL, phone: PHONE, service: SERVICE,
      scheduledFor: slotInDays(60).toISOString()
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/7 days/i);
  });

  test('a booking outside opening hours is refused', async () => {
    await store.saveBusinessSettings({ openTime: '08:00', closeTime: '17:00' });

    const response = await book({
      email: EMAIL, phone: PHONE, service: SERVICE,
      scheduledFor: slotInDays(1, 3).toISOString()
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/between 08:00 and 17:00/i);
  });

  test('a slot stops accepting bookings once its capacity is used', async () => {
    // One counter, one place per slot, so the second booking has nowhere to go.
    await store.updateService(SERVICE, { counters: 1, slotCapacity: 1 });
    const slot = slotInDays(1).toISOString();

    await bookVerified({ email: EMAIL, phone: PHONE, service: SERVICE, scheduledFor: slot });

    const second = await book({
      email: 'other@example.com', phone: '0911222333', service: SERVICE, scheduledFor: slot
    });

    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/fully booked/i);
  });

  test('availability only offers slots that still have room', async () => {
    const response = await request(app).get('/api/online/availability').query({ service: SERVICE });

    expect(response.status).toBe(200);
    expect(response.body.slotMinutes).toBe(30);
    expect(response.body.days.length).toBeGreaterThan(0);
    expect(response.body.days[0].slots[0]).toHaveProperty('remaining');
  });
});

describe('verification', () => {
  test('a booking is held until a code is redeemed', async () => {
    const step1 = await book({
      email: EMAIL, phone: PHONE, service: SERVICE, scheduledFor: slotInDays(1).toISOString()
    });

    expect(step1.status).toBe(202);
    expect(step1.body.verificationRequired).toBe(true);
    expect(step1.body.challengeId).toBeTruthy();

    // Nothing has entered the queue yet.
    const leads = await store.listLeads(null, { includePending: true });
    expect(leads).toHaveLength(0);
  });

  test('a wrong code does not create a ticket', async () => {
    const step1 = await book({
      email: EMAIL, phone: PHONE, service: SERVICE, scheduledFor: slotInDays(1).toISOString()
    });

    const response = await book({ challengeId: step1.body.challengeId, code: '000000' });

    expect(response.status).toBe(401);
    const leads = await store.listLeads(null, { includePending: true });
    expect(leads).toHaveLength(0);
  });

  test('the details cannot be swapped between requesting and redeeming a code', async () => {
    const step1 = await book({
      email: EMAIL, phone: PHONE, service: SERVICE, scheduledFor: slotInDays(1).toISOString()
    });

    const response = await book({
      challengeId: step1.body.challengeId,
      code: step1.body.devCode,
      // Attempting to substitute a different customer at redemption time.
      email: 'attacker@example.com',
      phone: '0999999999'
    });

    expect(response.status).toBe(201);
    const stored = await store.getLeadByTicket(response.body.ticketNumber);
    expect(stored.email).toBe(EMAIL);
    expect(stored.phone).toBe(PHONE);
  });
});

describe('check-in window', () => {
  const bookTomorrow = () => bookVerified({
    email: EMAIL, phone: PHONE, service: SERVICE, scheduledFor: slotInDays(1).toISOString()
  });

  test('checking in the day before is refused', async () => {
    const booking = await bookTomorrow();

    const response = await request(app)
      .post('/api/online/checkin')
      .send({ ticketNumber: booking.ticketNumber, identifier: PHONE });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/Check-in opens/i);
  });

  test('an on-time check-in keeps the appointment slot as its queue position', async () => {
    const soon = new Date(Date.now() + 10 * 60000);
    const booking = await bookVerified({
      email: EMAIL, phone: PHONE, service: SERVICE, scheduledFor: soon.toISOString()
    });

    const response = await request(app)
      .post('/api/online/checkin')
      .send({ ticketNumber: booking.ticketNumber, identifier: PHONE });

    expect(response.status).toBe(200);
    expect(response.body.lead.status).toBe('Waiting');
    expect(response.body.downgradedToWalkIn).toBe(false);

    const stored = await store.getLeadById(response.body.lead.id);
    expect(new Date(stored.effectiveQueueTime).getTime())
      .toBe(new Date(stored.scheduledFor).getTime());
  });

  test('a late arrival is downgraded to a walk-in rather than turned away', async () => {
    const soon = new Date(Date.now() + 5 * 60000);
    const booking = await bookVerified({
      email: EMAIL, phone: PHONE, service: SERVICE, scheduledFor: soon.toISOString()
    });

    // Move the whole reservation into the past so the grace period has elapsed.
    const lead = await store.getLeadByTicket(booking.ticketNumber);
    lead.scheduledFor = new Date(Date.now() - 60 * 60000);
    lead.pendingExpiresAt = new Date(Date.now() - 45 * 60000);
    await store.saveLead(lead);

    const response = await request(app)
      .post('/api/online/checkin')
      .send({ ticketNumber: booking.ticketNumber, identifier: PHONE });

    expect(response.status).toBe(200);
    expect(response.body.downgradedToWalkIn).toBe(true);
    expect(response.body.lead.status).toBe('Waiting');
  });

  test('checking in twice reports success rather than an error', async () => {
    const soon = new Date(Date.now() + 10 * 60000);
    const booking = await bookVerified({
      email: EMAIL, phone: PHONE, service: SERVICE, scheduledFor: soon.toISOString()
    });

    await request(app).post('/api/online/checkin')
      .send({ ticketNumber: booking.ticketNumber, identifier: PHONE });

    const second = await request(app).post('/api/online/checkin')
      .send({ ticketNumber: booking.ticketNumber, identifier: PHONE });

    expect(second.status).toBe(200);
    expect(second.body.alreadyCheckedIn).toBe(true);
  });

  test('repeated wrong identifiers lock the ticket out (brute-force guard)', async () => {
    const soon = new Date(Date.now() + 10 * 60000);
    const booking = await bookVerified({
      email: EMAIL, phone: PHONE, service: SERVICE, scheduledFor: soon.toISOString()
    });

    const attempt = () => request(app).post('/api/online/checkin')
      .send({ ticketNumber: booking.ticketNumber, identifier: '0000000000' });

    for (let i = 0; i < 5; i += 1) {
      const response = await attempt();
      expect(response.status).toBe(401);
    }

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too many failed attempts/i);
  });
});
