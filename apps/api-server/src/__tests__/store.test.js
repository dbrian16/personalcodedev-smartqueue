/* eslint-env jest */
/**
 * The pieces that let the backend run with no external services, plus the
 * single ordering key that replaced three overlapping rules.
 */
const { createMemoryClient } = require('../store/memoryClient');
const { sortLeads, computeEffectiveQueueTime, normalizeLead } = require('../store/leadsStore');
const { redlock } = require('../utils/redlock');
const { store, setup, resetQueue } = require('./helpers');

describe('in-process key-value client', () => {
  let client;

  beforeEach(() => { client = createMemoryClient(); });

  test('hashes behave like the redis commands the stores call', async () => {
    expect(await client.hGetAll('leads')).toEqual({});

    await client.hSet('leads', '1', 'first');
    expect(await client.hGet('leads', '1')).toBe('first');
    expect(await client.hExists('leads', '1')).toBe(true);

    // hSetNX must not overwrite, which is what makes the legacy-key migration safe.
    expect(await client.hSetNX('leads', '1', 'second')).toBe(false);
    expect(await client.hGet('leads', '1')).toBe('first');

    await client.hDel('leads', '1');
    expect(await client.hExists('leads', '1')).toBe(false);
  });

  test('SET NX refuses a key that already exists — the basis of the lock', async () => {
    expect(await client.set('lock:x', 'token-a', { NX: true, PX: 1000 })).toBe('OK');
    expect(await client.set('lock:x', 'token-b', { NX: true, PX: 1000 })).toBeNull();
  });

  test('a key with a TTL disappears once it elapses', async () => {
    await client.set('otp:1', 'value', { PX: 20 });
    expect(await client.get('otp:1')).toBe('value');

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(await client.get('otp:1')).toBeNull();
  });

  test('counters increment from nothing', async () => {
    expect(await client.incr('ticket_counter')).toBe(1);
    expect(await client.incr('ticket_counter')).toBe(2);
  });

  test('lists are trimmed from the tail, as the audit log expects', async () => {
    for (let i = 1; i <= 5; i += 1) await client.rPush('audit', `entry-${i}`);
    await client.lTrim('audit', -3, -1);
    expect(await client.lRange('audit', 0, -1)).toEqual(['entry-3', 'entry-4', 'entry-5']);
  });

  test('scanIterator matches by glob, which the key migration relies on', async () => {
    await client.hSet('leads:2026-01-01', 'a', '{}');
    await client.hSet('leads', 'b', '{}');

    const found = [];
    for await (const key of client.scanIterator({ MATCH: 'leads:*' })) found.push(key);

    expect(found).toEqual(['leads:2026-01-01']);
  });
});

describe('distributed lock', () => {
  beforeAll(setup);

  test('a second holder is refused while the first still holds the lock', async () => {
    let inner;
    await redlock.using(['locks:test:resource'], 1000, async () => {
      inner = await redlock.using(['locks:test:resource'], 1000, async () => 'should not run')
        .catch((error) => error);
    });

    expect(inner).toBeInstanceOf(Error);
    expect(inner.name).toBe('ExecutionError');
    expect(inner.statusCode).toBe(409);
  });

  test('the lock is released once the routine finishes', async () => {
    await redlock.using(['locks:test:release'], 1000, async () => 'first');
    const second = await redlock.using(['locks:test:release'], 1000, async () => 'second');
    expect(second).toBe('second');
  });

  test('a lock is released even when the routine throws', async () => {
    await expect(
      redlock.using(['locks:test:throw'], 1000, async () => { throw new Error('boom'); })
    ).rejects.toThrow('boom');

    await expect(
      redlock.using(['locks:test:throw'], 1000, async () => 'recovered')
    ).resolves.toBe('recovered');
  });
});

describe('effective queue time', () => {
  const at = (iso) => new Date(iso);

  test('a walk-in is ordered by arrival', () => {
    const lead = normalizeLead({ id: 1, timestamp: at('2026-08-11T09:00:00Z') });
    expect(computeEffectiveQueueTime(lead).toISOString()).toBe('2026-08-11T09:00:00.000Z');
  });

  test('arriving early for an appointment gains nothing', () => {
    const queueTime = computeEffectiveQueueTime({
      scheduledFor: at('2026-08-11T14:00:00Z'),
      checkedInAt: at('2026-08-11T08:00:00Z'),
      timestamp: at('2026-08-10T12:00:00Z')
    });

    expect(queueTime.toISOString()).toBe('2026-08-11T14:00:00.000Z');
  });

  test('arriving after the appointment is ordered by arrival', () => {
    const queueTime = computeEffectiveQueueTime({
      scheduledFor: at('2026-08-11T14:00:00Z'),
      checkedInAt: at('2026-08-11T15:30:00Z'),
      timestamp: at('2026-08-10T12:00:00Z')
    });

    expect(queueTime.toISOString()).toBe('2026-08-11T15:30:00.000Z');
  });

  test('the queue orders by that one key, not by source or a priority flag', () => {
    const walkInNow = normalizeLead({ id: 1, timestamp: at('2026-08-11T10:00:00Z') });
    const bookedEarlier = normalizeLead({
      id: 2,
      timestamp: at('2026-08-11T09:55:00Z'),
      scheduledFor: at('2026-08-11T09:30:00Z'),
      checkedInAt: at('2026-08-11T09:29:00Z')
    });
    const flaggedButLate = normalizeLead({ id: 3, timestamp: at('2026-08-11T11:00:00Z'), priority: true });

    const order = sortLeads([flaggedButLate, walkInNow, bookedEarlier]).map((lead) => lead.id);
    expect(order).toEqual([2, 1, 3]);
  });
});

describe('service catalogue', () => {
  beforeAll(setup);
  beforeEach(resetQueue);

  test('lookup is case-insensitive so a typo cannot create a second queue', async () => {
    const found = await store.getService('general inquiry');
    expect(found).not.toBeNull();
    expect(found.name).toBe('General Inquiry');
  });

  test('an inactive service disappears from the public list but keeps its tickets', async () => {
    await store.updateService('General Inquiry', { isActive: false });

    const publicList = await store.listServices();
    const fullList = await store.listServices({ includeInactive: true });

    expect(publicList.map((s) => s.name)).not.toContain('General Inquiry');
    expect(fullList.map((s) => s.name)).toContain('General Inquiry');

    await store.updateService('General Inquiry', { isActive: true });
  });

  test('settings merge over the seed defaults, so a new knob is never undefined', async () => {
    await store.saveBusinessSettings({ maxRecalls: 4 });
    const settings = await store.getBusinessSettings();

    expect(settings.maxRecalls).toBe(4);
    expect(settings.slotMinutes).toBe(30);
    expect(settings.calledTimeoutMinutes).toBe(5);
  });
});
