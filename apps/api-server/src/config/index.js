require('dotenv').config();

const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';
const databaseRequired = process.env.USE_DATABASE === 'true' || isProduction;
const wantsDatabase = !isTest && !!process.env.DATABASE_URL && process.env.USE_DATABASE !== 'false';

const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'omni-queue-360-dev-secret');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
// A ticket outlives a staff shift, so the customer token gets its own lifetime.
// Sharing the 12h staff lifetime would expire a customer's ticket mid-wait.
const CUSTOMER_JWT_EXPIRES_IN = process.env.CUSTOMER_JWT_EXPIRES_IN || '7d';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || (isProduction ? '' : 'admin');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (isProduction ? '' : 'admin123');

// Individual staff accounts with service assignments
const STAFF_ACCOUNTS = [
  { username: 'staff1', password: 'staff1', displayName: 'Staff 1', service: 'Penetration Testing (Pentest)' },
  { username: 'staff2', password: 'staff2', displayName: 'Staff 2', service: 'Penetration Testing (Pentest)' },
  { username: 'staff3', password: 'staff3', displayName: 'Staff 3', service: 'System Security Consulting' },
  { username: 'staff4', password: 'staff4', displayName: 'Staff 4', service: 'System Security Consulting' },
  { username: 'staff5', password: 'staff5', displayName: 'Staff 5', service: 'General Inquiry' },
  { username: 'staff6', password: 'staff6', displayName: 'Staff 6', service: 'General Inquiry' }
];

// Seed catalogue. Persisted on first boot, then owned by the admin screen.
const DEFAULT_SERVICES = [
  { name: 'Penetration Testing (Pentest)', description: 'Offensive security assessment', counters: 2 },
  { name: 'System Security Consulting', description: 'Advisory and hardening review', counters: 2 },
  { name: 'General Inquiry', description: 'Walk-in questions and intake', counters: 2 }
];

if (!isTest && isProduction && !JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production.');
}

if (!isTest && isProduction && (!ADMIN_USERNAME || !ADMIN_PASSWORD)) {
  throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD are required in production.');
}

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
  : (isProduction ? false : true);

// auto  → use Redis when reachable, otherwise the in-process store (local default)
// redis → refuse to start without Redis (what production wants)
// memory→ never touch Redis, even if one is running
const QUEUE_STORE = (process.env.QUEUE_STORE || (isProduction ? 'redis' : 'auto')).toLowerCase();

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  isTest,
  databaseRequired,
  wantsDatabase,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  CUSTOMER_JWT_EXPIRES_IN,
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  STAFF_ACCOUNTS,
  DEFAULT_SERVICES,
  allowedOrigins,
  QUEUE_STORE,
  PORT: process.env.PORT || 5100,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  // Defaults to the local engine rather than '', so a fresh checkout gets real
  // predictions instead of falling through to a flat constant.
  AI_ENGINE_URL: process.env.AI_ENGINE_URL === undefined
    ? 'http://127.0.0.1:5001'
    : process.env.AI_ENGINE_URL,
  // Generous enough for a cold Flask worker on Windows; a tighter timeout makes
  // the first ticket of a session fall back to the default estimate.
  AI_ENGINE_TIMEOUT_MS: toNumber(process.env.AI_ENGINE_TIMEOUT_MS, 2000),
  AI_TRAINING_INTERVAL_MS: toNumber(process.env.AI_TRAINING_INTERVAL_MS, 15 * 60 * 1000),
  AI_TRAINING_MIN_SAMPLES: toNumber(process.env.AI_TRAINING_MIN_SAMPLES, 30),
  OTP_ENABLED: process.env.OTP_ENABLED === undefined
    ? true
    : process.env.OTP_ENABLED === 'true',
  OTP_PROVIDER: process.env.OTP_PROVIDER || 'console',
  // Without a real SMS provider the code has to reach the caller somehow; echoing
  // it is safe in development and hard-blocked in production below.
  OTP_DEV_ECHO: isProduction ? false : process.env.OTP_DEV_ECHO !== 'false'
};
