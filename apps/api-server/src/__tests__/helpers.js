/* eslint-env jest */
const request = require('supertest');
const app = require('../app');
const store = require('../store');

const ADMIN = { userType: 'admin', username: 'admin', password: 'admin123' };
const STAFF = { userType: 'staff', username: 'staff1', password: 'staff1' };

/**
 * Opens the centre every day, around the clock, for the duration of a test run.
 *
 * WHY: the business rules are the thing under test, and most of them only fire
 * while the centre is open. Pinning the hours keeps a suite from passing at
 * 10:00 and failing at 18:00 or on a Sunday.
 */
const openAlwaysSettings = {
  openDays: [0, 1, 2, 3, 4, 5, 6],
  openTime: '00:00',
  closeTime: '23:59',
  holidays: [],
  lastTicketBeforeCloseMinutes: 0
};

const setup = async () => {
  await store.initStore();
  await store.saveBusinessSettings(openAlwaysSettings);
};

const resetQueue = async () => {
  await store.clearQueueState();
  await store.saveBusinessSettings(openAlwaysSettings);
};

const login = async (credentials) => {
  const response = await request(app).post('/api/auth/login').send(credentials);
  if (response.status !== 200) {
    throw new Error(`login failed (${response.status}): ${JSON.stringify(response.body)}`);
  }
  return response.body;
};

const loginAdmin = () => login(ADMIN);
const loginStaff = () => login(STAFF);

/** Issues a walk-in ticket and returns the created lead. */
const createWalkIn = async ({ service, phone }) => {
  const response = await request(app).post('/api/leads').send({ service, phone });
  if (response.status !== 201) {
    throw new Error(`createWalkIn failed (${response.status}): ${JSON.stringify(response.body)}`);
  }
  return response.body;
};

/** Rewrites a lead's fields directly, to place it at a chosen point in time. */
const patchLeadInStore = async (id, changes) => {
  const lead = await store.getLeadById(id);
  Object.assign(lead, changes);
  return store.saveLead(lead);
};

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000);

module.exports = {
  app,
  store,
  request,
  ADMIN,
  STAFF,
  setup,
  resetQueue,
  loginAdmin,
  loginStaff,
  createWalkIn,
  patchLeadInStore,
  minutesAgo,
  openAlwaysSettings
};
