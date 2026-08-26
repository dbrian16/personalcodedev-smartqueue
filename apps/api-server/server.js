const http = require('http');
const app = require('./src/app');
const socket = require('./src/socket');
const store = require('./src/store');
const { getRedisClient } = require('./src/store/connection');
const config = require('./src/config');
const log = require('./src/utils/logger');
const queueService = require('./src/services/queueService');
const aiService = require('./src/services/aiService');
const { EXPIRE_CHECK_INTERVAL_MS } = require('./src/config/constants');

const server = http.createServer(app);

const startServer = async () => {
  // The store has to come first: the socket layer asks it whether Redis is real
  // before deciding to attach the Redis adapter.
  await store.initStore();
  await socket.initSocket(server);

  const timers = [];

  const every = (intervalMs, name, task) => {
    const handle = setInterval(() => {
      task().catch((error) => log.error(`${name} error`, { error: error.message }));
    }, intervalMs);
    if (typeof handle.unref === 'function') handle.unref();
    timers.push(handle);
  };

  // Mechanism M3: expires abandoned reservations, auto-closes tickets stranded in
  // Called, and warns an administrator about sessions that have run long.
  every(EXPIRE_CHECK_INTERVAL_MS, 'queueMaintenance', queueService.runQueueMaintenance);

  // Refits the wait-time model from served tickets. No-ops until there is enough
  // history, and never blocks a request either way.
  every(config.AI_TRAINING_INTERVAL_MS, 'aiTraining', aiService.trainModel);

  server.listen(config.PORT, '0.0.0.0', () => {
    log.info('server:start', {
      port: config.PORT,
      url: `http://127.0.0.1:${config.PORT}`,
      queueStore: store.isMemoryStore() ? 'in-process' : 'redis',
      database: store.usingDb() ? 'postgres' : 'none',
      aiEngine: config.AI_ENGINE_URL || 'disabled'
    });
  });

  const gracefulShutdown = async (signal) => {
    log.info(`${signal} received. Shutting down gracefully...`);
    timers.forEach(clearInterval);

    try { await socket.closeSocket(); } catch (e) { log.error('Socket close error', { error: e.message }); }

    const redisClient = getRedisClient();
    if (redisClient) {
      try { await redisClient.quit(); log.info('Queue store disconnected.'); } catch (e) { log.error('Queue store disconnect error', { error: e.message }); }
    }

    const pool = store.getPool();
    if (pool) {
      try { await pool.end(); log.info('PostgreSQL pool closed.'); } catch (e) { log.error('PostgreSQL disconnect error', { error: e.message }); }
    }

    server.close(() => {
      log.info('HTTP server closed');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

if (!config.isTest) {
  startServer().catch((error) => {
    log.error('Failed to start backend', { error: error.message });
    process.exit(1);
  });
}

module.exports = {
  app,
  server,
  store
};
