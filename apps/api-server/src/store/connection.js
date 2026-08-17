const { Pool } = require('pg');
const config = require('../config');

const pool = config.wantsDatabase ? new Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000
}) : null;
let dbReady = false;
let kvClient = null;

const getPool = () => pool;

/**
 * The key-value client backing locks, ephemeral state and — without Postgres —
 * the queue itself. Either a real Redis client or the in-process stand-in.
 */
const getRedisClient = () => kvClient;
const isRedisReady = () => !!(kvClient && kvClient.isReady);

/** True when running on the in-process store rather than a real Redis server. */
const isMemoryStore = () => !!(kvClient && kvClient.isMemory);

const usingDb = () => dbReady && pool;
const setDbReady = (ready) => { dbReady = ready; };
const setRedisClient = (client) => { kvClient = client; };

module.exports = {
  getPool,
  getRedisClient,
  isRedisReady,
  isMemoryStore,
  usingDb,
  setDbReady,
  setRedisClient
};
