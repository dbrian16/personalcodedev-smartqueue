#!/usr/bin/env node
/**
 * Demo data seeder. Optional.
 *
 * Run this AFTER `npm start` to populate a realistic scene so the queue board and
 * the Analytics dashboard look alive during a client demo. It signs two staff on
 * duty, issues a handful of walk-in and online tickets, and drives one all the way
 * to Completed + feedback.
 *
 *   node demo-seed.js
 *
 * Safe to skip entirely if you prefer to build the demo up live from an empty
 * queue. Requires the backend (port 5100) to be running. Node 20+ (global fetch).
 */
const API = process.env.API_BASE || 'http://localhost:5100/api';
const AUTH = API.replace(/\/api$/, '/api/auth');

const post = async (url, body, token) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${data.error || data.message || res.statusText}`);
  return data;
};
const patch = async (url, body, token) => {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${url} → ${res.status}: ${data.error || data.message}`);
  return data;
};

const GENERAL = 'General Inquiry';
const PENTEST = 'Penetration Testing (Pentest)';

const run = async () => {
  console.log('Seeding demo data →', API);

  // 1. Two staff on duty, so wait-time estimates show real numbers.
  const staffG = await post(`${AUTH}/login`, { userType: 'staff', username: 'staff5', password: 'staff5' });
  const staffP = await post(`${AUTH}/login`, { userType: 'staff', username: 'staff1', password: 'staff1' });
  await post(`${API}/admin/availability`, { staffId: 'Staff 5', status: 'online', position: GENERAL }, staffG.token);
  await post(`${API}/admin/availability`, { staffId: 'Staff 1', status: 'online', position: PENTEST }, staffP.token);
  console.log('  ✓ 2 staff signed on duty (General Inquiry, Pentest)');

  // 2. A spread of walk-in tickets.
  const walkIns = [
    { service: GENERAL, phone: '0900000011' },
    { service: GENERAL, phone: '0900000012' },
    { service: GENERAL, phone: '0900000013' },
    { service: PENTEST, phone: '0900000021' },
    { service: PENTEST, phone: '0900000022' }
  ];
  const created = [];
  for (const w of walkIns) created.push(await post(`${API}/leads`, w));
  console.log(`  ✓ ${created.length} walk-in tickets issued (${created.map(l => l.ticketNumber).join(', ')})`);

  // 3. Drive the first General ticket to Completed + a 5★ review, so Analytics has data.
  const first = created[0];
  await post(`${API}/staff/call-next`, { position: GENERAL }, staffG.token);
  await patch(`${API}/leads/${first.id}`, { status: 'Serving' }, staffG.token);
  await patch(`${API}/leads/${first.id}`, { status: 'Completed', notes: 'Resolved on first contact', tags: ['#Resolved'] }, staffG.token);
  const custTok = (await post(`${AUTH}/ticket-token`, { ticketNumber: first.ticketNumber })).token;
  await post(`${API}/feedback`, { leadId: first.id, rating: 5, comment: 'Fast and professional, thank you' }, custTok);
  console.log(`  ✓ ${first.ticketNumber} served → Completed + 5★ feedback`);

  // 4. One Pentest ticket left in Called state, so the staff console shows an active session.
  await post(`${API}/staff/call-next`, { position: PENTEST }, staffP.token);
  console.log('  ✓ Next Pentest customer Called (active session on the staff console)');

  // 5. An online booking left Pending, so the check-in flow is demoable.
  const soon = new Date(Date.now() + 20 * 60000).toISOString();
  const step1 = await post(`${API}/online/book`, { email: 'client.demo@example.com', phone: '0987111222', service: GENERAL, scheduledFor: soon });
  if (step1.challengeId) {
    const booked = await post(`${API}/online/book`, { challengeId: step1.challengeId, code: step1.devCode });
    console.log(`  ✓ Online booking ${booked.ticketNumber} (Pending — ready to check in; code was ${step1.devCode})`);
  }

  console.log('\nDone. Open the Admin dashboard (http://localhost:3101) to see the populated board.');
};

run().catch((err) => {
  console.error('\nSeed failed:', err.message);
  console.error('Is the backend running on port 5100? Start it with `npm start` first.');
  process.exit(1);
});
