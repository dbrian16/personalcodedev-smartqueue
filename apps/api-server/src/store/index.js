const { createClient } = require('redis');
const config = require('../config');
const log = require('../utils/logger');
const {
  getPool,
  setDbReady,
  setRedisClient,
  usingDb,
  getRedisClient,
  isRedisReady,
  isMemoryStore
} = require('./connection');
const {
  REDIS_CONNECT_MAX_ATTEMPTS,
  REDIS_CONNECT_RETRY_DELAY_MS,
  REDIS_CONNECT_TIMEOUT_MS,
  REDIS_RECONNECT_DELAY_STEP_MS,
  REDIS_RECONNECT_DELAY_MAX_MS,
  REDIS_PROBE_TIMEOUT_MS
} = require('../config/constants');
const { createMemoryClient } = require('./memoryClient');
const leadsStore = require('./leadsStore');
const staffStore = require('./staffStore');
const auditStore = require('./auditStore');
const catalogStore = require('./catalogStore');
const securityStore = require('./securityStore');

const LEGACY_LEADS_KEY = /^leads:\d{4}-\d{2}-\d{2}$/;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const closeQuietly = async (client) => {
  try {
    client.removeAllListeners();
    if (typeof client.destroy === 'function') client.destroy();
    else await client.disconnect();
  } catch (_error) {
    // The client never became usable; nothing to clean up.
  }
};

/**
 * Resolves to the client, or rejects, within `timeoutMs` — whatever node-redis does.
 *
 * WHY this exists: with a reconnect strategy that always returns a delay, a
 * `connect()` against a port nothing is listening on never settles. node-redis
 * simply keeps retrying, so `await connectRedis()` hung forever and the server
 * never reached `listen()` — no error, no exit, just a process printing
 * "Redis reconnecting..." until it was killed. A bounded race is what turns that
 * into a failure the caller can actually handle.
 */
const connectWithDeadline = (client, timeoutMs) => new Promise((resolve, reject) => {
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    reject(new Error(`connect timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();

  client.connect().then(
    (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    },
    (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
  );
});

/**
 * Connects to Redis, retrying a few times before giving up.
 * WHY: Redis is the lock manager, the socket adapter backend and — when Postgres
 * is disabled — the only datastore. A swallowed connect error used to leave the
 * process without a client for its whole lifetime, which reads as an empty queue
 * rather than as an outage.
 * @param {{attempts?: number, timeoutMs?: number}} [options]
 * @returns {Promise<Object>} A connected redis client.
 */
const connectRedis = async (options = {}) => {
  const attempts = options.attempts || REDIS_CONNECT_MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs || REDIS_CONNECT_TIMEOUT_MS;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const client = createClient({
      url: config.REDIS_URL,
      socket: {
        connectTimeout: timeoutMs,
        reconnectStrategy: (retries) => Math.min(retries * REDIS_RECONNECT_DELAY_STEP_MS, REDIS_RECONNECT_DELAY_MAX_MS)
      }
    });
    // Errors before the first successful connect are expected while probing, so
    // they are reported once by the caller rather than once per retry.
    client.on('error', () => {});

    try {
      await connectWithDeadline(client, timeoutMs);
      client.removeAllListeners('error');
      client.on('error', (err) => log.error('Redis Client Error', { error: err.message }));
      client.on('reconnecting', () => log.warn('Redis reconnecting...'));
      client.on('ready', () => log.info('Redis ready.'));
      return client;
    } catch (error) {
      lastError = error;
      log.warn('Redis connect failed', { attempt, url: config.REDIS_URL, error: error.message });
      await closeQuietly(client);
      if (attempt < attempts) await delay(attempt * REDIS_CONNECT_RETRY_DELAY_MS);
    }
  }

  throw new Error(`Cannot connect to Redis at ${config.REDIS_URL}: ${lastError ? lastError.message : 'unknown error'}`);
};

/**
 * Picks the key-value backend.
 *
 * WHY: a missing Redis used to abort startup, which made "run it locally" mean
 * "install and run Redis first". QUEUE_STORE=auto keeps the Redis upgrade path
 * while letting a bare checkout boot with nothing installed; production still
 * defaults to `redis` and therefore still fails loudly if Redis is gone.
 * @returns {Promise<Object>} A ready key-value client.
 */
const connectKeyValueStore = async () => {
  if (config.QUEUE_STORE === 'memory' || config.isTest) {
    log.info('store:memory', { reason: config.isTest ? 'test run' : 'QUEUE_STORE=memory' });
    return createMemoryClient();
  }

  if (config.QUEUE_STORE === 'redis') return connectRedis();

  // Probing, not committing: one short attempt is enough to learn whether a Redis
  // is there, and a developer with none should not wait ~15s to find out.
  try {
    return await connectRedis({ attempts: 1, timeoutMs: REDIS_PROBE_TIMEOUT_MS });
  } catch (error) {
    log.warn('store:memory_fallback', {
      url: config.REDIS_URL,
      error: error.message,
      hint: 'Queue state will live in this process only. Start Redis or set QUEUE_STORE=redis to require it.'
    });
    return createMemoryClient();
  }
};

/**
 * Folds the old per-day `leads:YYYY-MM-DD` hashes into the single `leads` hash.
 * WHY: the date-keyed layout dropped every ticket at midnight. Existing tickets
 * are merged once so switching key layouts does not orphan them.
 * @param {Object} redisClient
 * @returns {Promise<void>}
 */
const migrateLegacyLeadKeys = async (redisClient) => {
  const legacyKeys = [];

  for await (const entry of redisClient.scanIterator({ MATCH: 'leads:*', COUNT: 100 })) {
    const keys = Array.isArray(entry) ? entry : [entry];
    legacyKeys.push(...keys.filter((key) => LEGACY_LEADS_KEY.test(key)));
  }

  if (legacyKeys.length === 0) return;

  let migrated = 0;
  for (const legacyKey of legacyKeys) {
    const leads = await redisClient.hGetAll(legacyKey);
    for (const [id, value] of Object.entries(leads)) {
      // hSetNX so a lead already present under the new key is never overwritten.
      if (await redisClient.hSetNX(leadsStore.getLeadsKey(), id, value)) migrated += 1;
    }
    await redisClient.del(legacyKey);
  }

  log.info('Migrated legacy per-day lead keys', { keys: legacyKeys.length, leads: migrated });
};

const seedRedisAccounts = async (redisClient) => {
  if (!redisClient) return;
  const data = await redisClient.hGetAll('staff_accounts');
  if (Object.keys(data).length > 0) return;

  log.info('Seeding default staff accounts into the queue store...');
  for (const staff of config.STAFF_ACCOUNTS) {
    await redisClient.hSet('staff_accounts', staff.username, JSON.stringify({
      username: staff.username,
      password: staff.password,
      displayName: staff.displayName,
      service: staff.service,
      role: 'staff',
      isActive: true
    }));
  }
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS leads (
    id BIGSERIAL PRIMARY KEY,
    ticket_number TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    service TEXT NOT NULL,
    staff TEXT,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    priority BOOLEAN NOT NULL DEFAULT false,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT NOT NULL DEFAULT '',
    predicted_wait_time NUMERIC NOT NULL DEFAULT 0,
    assigned_position TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    called_at TIMESTAMPTZ,
    serving_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    feedback JSONB,
    scheduled_for TIMESTAMPTZ,
    pending_expires_at TIMESTAMPTZ,
    checked_in_at TIMESTAMPTZ,
    recall_count INT NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS staff_availability (
    staff_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    position TEXT NOT NULL DEFAULT 'Default',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS checkin_audit (
    id BIGSERIAL PRIMARY KEY,
    ticket_number TEXT,
    success BOOLEAN NOT NULL,
    reason TEXT,
    identifier_type TEXT,
    identifier_hash TEXT,
    identifier_mask TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS staff_accounts (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    display_name TEXT NOT NULL,
    service TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT true
  );

  CREATE TABLE IF NOT EXISTS services (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    counters INT NOT NULL DEFAULT 1,
    slot_capacity INT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE SEQUENCE IF NOT EXISTS ticket_counter START WITH 1;
  CREATE INDEX IF NOT EXISTS idx_leads_position_status ON leads (assigned_position, status);
  CREATE INDEX IF NOT EXISTS idx_leads_ticket_lower ON leads (LOWER(ticket_number));
  CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads (phone);
  CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (LOWER(email));
`;

const MIGRATIONS = `
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS pending_expires_at TIMESTAMPTZ;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS recall_count INT NOT NULL DEFAULT 0;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS effective_queue_time TIMESTAMPTZ;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS walk_in_downgraded BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS long_session_alerted_at TIMESTAMPTZ;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS queue_position_at_creation INT NOT NULL DEFAULT 0;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS active_staff_at_creation INT NOT NULL DEFAULT 1;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS average_service_time_at_creation NUMERIC NOT NULL DEFAULT 0;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS queue_status TEXT NOT NULL DEFAULT 'Low';
  UPDATE leads SET effective_queue_time = GREATEST(COALESCE(scheduled_for, created_at), COALESCE(checked_in_at, created_at))
    WHERE effective_queue_time IS NULL;
  CREATE INDEX IF NOT EXISTS idx_leads_effective_queue_time ON leads (effective_queue_time);
`;

const initStore = async () => {
  const currentPool = getPool();

  const kvClient = await connectKeyValueStore();
  setRedisClient(kvClient);
  log.info('store:connected', { backend: kvClient.isMemory ? 'in-process' : 'redis' });
  await migrateLegacyLeadKeys(kvClient);

  if (!currentPool) {
    await seedRedisAccounts(kvClient);
    await catalogStore.seedServices(config.DEFAULT_SERVICES);
    return;
  }

  try {
    await currentPool.query(SCHEMA);

    const staffCountRes = await currentPool.query('SELECT COUNT(*) FROM staff_accounts');
    if (parseInt(staffCountRes.rows[0].count, 10) === 0) {
      log.info('Seeding default staff accounts...');
      for (const staff of config.STAFF_ACCOUNTS) {
        await currentPool.query(
          `INSERT INTO staff_accounts (username, password, display_name, service, role) VALUES ($1, $2, $3, $4, 'staff')`,
          [staff.username, staff.password, staff.displayName, staff.service]
        );
      }
    }

    await currentPool.query(MIGRATIONS);

    await currentPool.query(`
      SELECT setval(
        'ticket_counter',
        GREATEST(
          (
            SELECT COALESCE(
              MAX((substring(ticket_number from '^TKT-([0-9]+)$'))::int),
              1
            )
            FROM leads
            WHERE ticket_number ~ '^TKT-[0-9]+$'
          ),
          1
        )
      );
    `);

    setDbReady(true);
    log.info('Persistent queue store connected.');
  } catch (error) {
    setDbReady(false);
    if (config.databaseRequired) throw error;
    log.warn('Database unavailable; falling back to the key-value queue store.', { error: error.message });
    await seedRedisAccounts(kvClient);
  }

  await catalogStore.seedServices(config.DEFAULT_SERVICES);
};

/** Empties the queue: used by `npm run reset` and between test cases. */
const clearQueueState = async () => {
  const redisClient = getRedisClient();
  if (!redisClient) return;
  await redisClient.del(leadsStore.getLeadsKey());
  await redisClient.del('staff_availability');
  await redisClient.set('ticket_counter', '0');
  await redisClient.del('checkin_audit');
  catalogStore.invalidateSettingsCache();
};

module.exports = {
  getPool,
  getRedisClient,
  isRedisReady,
  isMemoryStore,
  initStore,
  usingDb,
  ...leadsStore,
  ...staffStore,
  ...auditStore,
  ...catalogStore,
  ...securityStore,
  clearQueueState
};
