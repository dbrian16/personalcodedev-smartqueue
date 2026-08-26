/* eslint-env jest */
/**
 * The ticket lifecycle constraints.
 * Each test names the situation it covers.
 */
const {
  app, store, request, setup, resetQueue,
  loginStaff, createWalkIn, patchLeadInStore, minutesAgo
} = require('./helpers');

const queueService = require('../services/queueService');

const SERVICE = 'Penetration Testing (Pentest)';
const OTHER_SERVICE = 'System Security Consulting';

let staff;

beforeAll(async () => {
  await setup();
  staff = await loginStaff();
});

beforeEach(resetQueue);

const auth = () => ({ Authorization: `Bearer ${staff.token}` });

describe('ticket creation', () => {
  test('the kiosk lets a customer skip the phone number', async () => {
    const response = await request(app).post('/api/leads').send({ service: SERVICE });

    expect(response.status).toBe(201);
    // Anonymous means anonymous: no fabricated contact detail standing in.
    expect(response.body.phone).toBe('');
    expect(response.body.email).toBe('');
  });

  test('a phone number that is supplied still has to be a real one', async () => {
    const response = await request(app).post('/api/leads').send({ service: SERVICE, phone: '123' });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/invalid phone/i);
  });

  test('an anonymous ticket is not findable by lookup, and does not block a second one', async () => {
    await request(app).post('/api/leads').send({ service: SERVICE });

    // The per-customer cap needs an identity; without one it cannot apply.
    const second = await request(app).post('/api/leads').send({ service: SERVICE });
    expect(second.status).toBe(201);

    const lookup = await request(app).post('/api/leads/lookup').send({ identifier: '0900000000' });
    expect(lookup.body.count).toBe(0);
  });

  test('the phone number can be made mandatory from the admin settings', async () => {
    await store.saveBusinessSettings({ requireKioskPhone: true });

    const response = await request(app).post('/api/leads').send({ service: SERVICE });
    expect(response.status).toBe(400);

    await store.saveBusinessSettings({ requireKioskPhone: false });
  });

  test('a service outside the catalogue is refused', async () => {
    const response = await request(app)
      .post('/api/leads')
      .send({ service: 'Nonexistent Line', phone: '0900000001' });

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not a service/i);
  });

  test('one person cannot hold two live tickets for the same service', async () => {
    await createWalkIn({ service: SERVICE, phone: '0900000001' });

    const second = await request(app)
      .post('/api/leads')
      .send({ service: SERVICE, phone: '0900000001' });

    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/already hold/i);
  });

  test('a customer is capped at two concurrent service lines', async () => {
    await createWalkIn({ service: SERVICE, phone: '0900000002' });
    await createWalkIn({ service: OTHER_SERVICE, phone: '0900000002' });

    const third = await request(app)
      .post('/api/leads')
      .send({ service: 'General Inquiry', phone: '0900000002' });

    expect(third.status).toBe(409);
    expect(third.body.error).toMatch(/at most 2 services/i);
  });

  test('a wait time is withheld, not shown as zero, when no counter is open', async () => {
    const lead = await createWalkIn({ service: SERVICE, phone: '0900000003' });
    expect(lead.queueStatus).toBe('Unavailable');
  });
});

describe('lookup and self-service cancellation', () => {
  test('a lost ticket number is recoverable from the phone number', async () => {
    const lead = await createWalkIn({ service: SERVICE, phone: '0912345678' });

    const response = await request(app).post('/api/leads/lookup').send({ identifier: '0912345678' });

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.tickets[0].ticketNumber).toBe(lead.ticketNumber);
    expect(response.body.tickets[0].token).toBeTruthy();
  });

  test('lookup rejects an identifier that is neither an email nor a phone number', async () => {
    const response = await request(app).post('/api/leads/lookup').send({ identifier: 'abc' });
    expect(response.status).toBe(400);
  });

  test('a customer can release their own ticket while waiting', async () => {
    const lead = await createWalkIn({ service: SERVICE, phone: '0900000004' });
    const { body: tracked } = await request(app).get(`/api/leads/track/${lead.ticketNumber}`);

    const response = await request(app)
      .post(`/api/leads/${lead.id}/cancel`)
      .set({ Authorization: `Bearer ${tracked.token}` });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('Cancelled');
    expect(response.body.cancelReason).toBe('cancelled_by_customer');
  });

  test('a customer cannot cancel somebody else\'s ticket', async () => {
    const mine = await createWalkIn({ service: SERVICE, phone: '0900000005' });
    const theirs = await createWalkIn({ service: OTHER_SERVICE, phone: '0900000006' });
    const { body: tracked } = await request(app).get(`/api/leads/track/${mine.ticketNumber}`);

    const response = await request(app)
      .post(`/api/leads/${theirs.id}/cancel`)
      .set({ Authorization: `Bearer ${tracked.token}` });

    expect(response.status).toBe(403);
  });

  test('a called ticket can no longer be cancelled by the customer', async () => {
    const lead = await createWalkIn({ service: SERVICE, phone: '0900000007' });
    const { body: tracked } = await request(app).get(`/api/leads/track/${lead.ticketNumber}`);
    await request(app).post('/api/staff/call-next').set(auth()).send({ position: SERVICE });

    const response = await request(app)
      .post(`/api/leads/${lead.id}/cancel`)
      .set({ Authorization: `Bearer ${tracked.token}` });

    expect(response.status).toBe(409);
  });
});

describe('calling and serving', () => {
  test('another service line cannot be called by accident', async () => {
    await createWalkIn({ service: OTHER_SERVICE, phone: '0900000008' });

    const response = await request(app)
      .post('/api/staff/call-next')
      .set(auth())
      .send({ position: OTHER_SERVICE });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/switch counters explicitly/i);
  });

  test('another service line can be covered deliberately', async () => {
    const lead = await createWalkIn({ service: OTHER_SERVICE, phone: '0900000021' });

    const response = await request(app)
      .post('/api/staff/call-next')
      .set(auth())
      .send({ position: OTHER_SERVICE, coveringFor: true });

    expect(response.status).toBe(200);
    expect(response.body.ticketNumber).toBe(lead.ticketNumber);
    expect(response.body.coveringFor).toBe(OTHER_SERVICE);
  });

  test('whoever took a covered ticket may finish it without asking again', async () => {
    const lead = await createWalkIn({ service: OTHER_SERVICE, phone: '0900000022' });
    await request(app).post('/api/staff/call-next').set(auth())
      .send({ position: OTHER_SERVICE, coveringFor: true });

    const serving = await request(app).patch(`/api/leads/${lead.id}`).set(auth()).send({ status: 'Serving' });
    expect(serving.status).toBe(200);

    const completed = await request(app).patch(`/api/leads/${lead.id}`).set(auth()).send({ status: 'Completed' });
    expect(completed.status).toBe(200);
  });

  test('covering can be switched off centre-wide', async () => {
    await store.saveBusinessSettings({ allowCrossCounterCalls: false });
    await createWalkIn({ service: OTHER_SERVICE, phone: '0900000023' });

    const response = await request(app)
      .post('/api/staff/call-next')
      .set(auth())
      .send({ position: OTHER_SERVICE, coveringFor: true });

    expect(response.status).toBe(403);
    await store.saveBusinessSettings({ allowCrossCounterCalls: true });
  });

  test('call-next with an empty queue reports it clearly', async () => {
    const response = await request(app)
      .post('/api/staff/call-next')
      .set(auth())
      .send({ position: SERVICE });

    expect(response.status).toBe(404);
  });

  test('a ticket cannot jump from Waiting straight to Completed', async () => {
    const lead = await createWalkIn({ service: SERVICE, phone: '0900000009' });

    const response = await request(app)
      .patch(`/api/leads/${lead.id}`)
      .set(auth())
      .send({ status: 'Completed' });

    expect(response.status).toBe(409);
  });

  test('the recall cap converts a ticket to a no-show', async () => {
    const lead = await createWalkIn({ service: SERVICE, phone: '0900000010' });
    await request(app).post('/api/staff/call-next').set(auth()).send({ position: SERVICE });

    const first = await request(app).post(`/api/staff/recall/${lead.id}`).set(auth());
    expect(first.body.status).toBe('Called');
    expect(first.body.recallCount).toBe(1);

    const second = await request(app).post(`/api/staff/recall/${lead.id}`).set(auth());
    expect(second.body.status).toBe('Called');

    const third = await request(app).post(`/api/staff/recall/${lead.id}`).set(auth());
    expect(third.body.status).toBe('No-Show');
    expect(third.body.autoNoShow).toBe(true);
  });
});

describe('transfer', () => {
  const serveAndComplete = async (leadId) => {
    await request(app).post('/api/staff/call-next').set(auth()).send({ position: SERVICE });
    await request(app).patch(`/api/leads/${leadId}`).set(auth()).send({ status: 'Serving' });
    await request(app).patch(`/api/leads/${leadId}`).set(auth()).send({ status: 'Completed' });
  };

  test('a waiting ticket cannot be transferred, only a called or serving one', async () => {
    const lead = await createWalkIn({ service: SERVICE, phone: '0900000011' });

    const response = await request(app)
      .post(`/api/leads/${lead.id}/transfer`)
      .set(auth())
      .send({ newService: OTHER_SERVICE });

    expect(response.status).toBe(409);
  });

  test('a completed ticket cannot be revived by a transfer', async () => {
    const lead = await createWalkIn({ service: SERVICE, phone: '0900000012' });
    await serveAndComplete(lead.id);

    const response = await request(app)
      .post(`/api/leads/${lead.id}/transfer`)
      .set(auth())
      .send({ newService: OTHER_SERVICE });

    expect(response.status).toBe(409);

    const after = await store.getLeadById(lead.id);
    expect(after.status).toBe('Completed');
    expect(after.completedAt).toBeTruthy();
  });

  test('transferring to the same service is refused', async () => {
    const lead = await createWalkIn({ service: SERVICE, phone: '0900000013' });
    await request(app).post('/api/staff/call-next').set(auth()).send({ position: SERVICE });

    const response = await request(app)
      .post(`/api/leads/${lead.id}/transfer`)
      .set(auth())
      .send({ newService: SERVICE });

    expect(response.status).toBe(409);
  });

  test('a transfer keeps the wait already served instead of jumping the queue', async () => {
    const lead = await createWalkIn({ service: SERVICE, phone: '0900000014' });
    const before = await store.getLeadById(lead.id);
    await request(app).post('/api/staff/call-next').set(auth()).send({ position: SERVICE });

    const response = await request(app)
      .post(`/api/leads/${lead.id}/transfer`)
      .set(auth())
      .send({ newService: OTHER_SERVICE });

    expect(response.status).toBe(200);
    expect(response.body.assignedPosition).toBe(OTHER_SERVICE);
    expect(response.body.priority).toBe(false);
    expect(new Date(response.body.effectiveQueueTime).getTime())
      .toBe(new Date(before.effectiveQueueTime).getTime());
  });
});

describe('ratings', () => {
  test('an unserved ticket cannot be rated', async () => {
    const lead = await createWalkIn({ service: SERVICE, phone: '0900000015' });
    const { body: tracked } = await request(app).get(`/api/leads/track/${lead.ticketNumber}`);

    const response = await request(app)
      .post('/api/feedback')
      .set({ Authorization: `Bearer ${tracked.token}` })
      .send({ leadId: lead.id, rating: 5 });

    expect(response.status).toBe(409);
  });

  test('a rating is accepted once and cannot be overwritten', async () => {
    const lead = await createWalkIn({ service: SERVICE, phone: '0900000016' });
    const { body: tracked } = await request(app).get(`/api/leads/track/${lead.ticketNumber}`);
    const headers = { Authorization: `Bearer ${tracked.token}` };

    await request(app).post('/api/staff/call-next').set(auth()).send({ position: SERVICE });
    await request(app).patch(`/api/leads/${lead.id}`).set(auth()).send({ status: 'Serving' });
    await request(app).patch(`/api/leads/${lead.id}`).set(auth()).send({ status: 'Completed' });

    const first = await request(app).post('/api/feedback').set(headers).send({ leadId: lead.id, rating: 5 });
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/feedback').set(headers).send({ leadId: lead.id, rating: 1 });
    expect(second.status).toBe(409);

    const stored = await store.getLeadById(lead.id);
    expect(stored.feedback.rating).toBe(5);
  });
});

describe('background maintenance', () => {
  test('a ticket stranded in Called becomes a no-show on its own', async () => {
    const lead = await createWalkIn({ service: SERVICE, phone: '0900000017' });
    await request(app).post('/api/staff/call-next').set(auth()).send({ position: SERVICE });
    await patchLeadInStore(lead.id, { calledAt: minutesAgo(30) });

    const report = await queueService.runQueueMaintenance();

    expect(report.autoNoShow).toBe(1);
    const after = await store.getLeadById(lead.id);
    expect(after.status).toBe('No-Show');
    expect(after.cancelReason).toBe('auto_no_show_timeout');
  });

  test('a long session is flagged to an administrator but never closed', async () => {
    const lead = await createWalkIn({ service: SERVICE, phone: '0900000018' });
    await request(app).post('/api/staff/call-next').set(auth()).send({ position: SERVICE });
    await request(app).patch(`/api/leads/${lead.id}`).set(auth()).send({ status: 'Serving' });
    await patchLeadInStore(lead.id, { servingAt: minutesAgo(90) });

    const report = await queueService.runQueueMaintenance();

    expect(report.alerted).toBe(1);
    const after = await store.getLeadById(lead.id);
    expect(after.status).toBe('Serving');
    expect(after.longSessionAlertedAt).toBeTruthy();
  });

  test('yesterday\'s unserved ticket does not lead this morning\'s queue', async () => {
    const lead = await createWalkIn({ service: SERVICE, phone: '0900000019' });
    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000);
    await patchLeadInStore(lead.id, { effectiveQueueTime: yesterday, timestamp: yesterday });

    const report = await queueService.runQueueMaintenance();

    expect(report.closedOut).toBe(1);
    const after = await store.getLeadById(lead.id);
    expect(after.status).toBe('Cancelled');
    expect(after.cancelReason).toBe('not_served_before_closing');
  });
});
