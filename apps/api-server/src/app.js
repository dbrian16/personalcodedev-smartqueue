const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const log = require('./utils/logger');
const { generalLimiter, publicEndpointLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const leadsRoutes = require('./routes/leads');
const onlineRoutes = require('./routes/online');
const staffRoutes = require('./routes/staff');
const adminRoutes = require('./routes/admin');
const feedbackRoutes = require('./routes/feedback');
const catalogRoutes = require('./routes/catalog');
const store = require('./store');

const app = express();

app.use(helmet());
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY));
}

app.use(cors({
  origin: config.allowedOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));

// Express 5 leaves req.body undefined when a request carries no body at all,
// where Express 4 gave you {}. Several endpoints are legitimately called with no
// payload (recall, no-show), and reading one optional flag off it should not turn
// into a 500. Normalising once here is cheaper than guarding at every read.
app.use((req, _res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    log.info('request', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: req.ip
    });
  });
  next();
});

app.use(generalLimiter);

app.get('/api/health', async (_req, res) => {
  const status = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    queueStore: store.isMemoryStore() ? 'in-process' : 'redis'
  };

  const pool = store.getPool();
  if (!pool) {
    status.database = 'not configured';
  } else {
    try {
      await pool.query('SELECT 1');
      status.database = store.usingDb() ? 'connected' : 'reachable but not in use';
    } catch (_e) {
      status.database = 'disconnected';
      status.status = 'degraded';
    }
  }

  // The key-value store backs the locks, the socket adapter and, without
  // Postgres, the queue itself, so an unusable one is never a healthy state.
  // The in-process backend lives in this process and cannot be down on its own,
  // so it is reported as healthy without a probe.
  try {
    if (!store.isRedisReady()) throw new Error('client not ready');
    await store.getRedisClient().ping();
    status.redis = store.isMemoryStore() ? 'in-process' : 'connected';
  } catch (_e) {
    status.redis = 'disconnected';
    status.status = 'degraded';
  }

  const code = status.status === 'ok' ? 200 : 503;
  return res.status(code).json(status);
});

app.use('/api/catalog', catalogRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/online', publicEndpointLimiter, onlineRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/feedback', feedbackRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}`, message: 'Not found' });
});

app.use(errorHandler);

module.exports = app;
