const LOG_LEVEL = (process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')).toLowerCase();
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLogLevel = LOG_LEVELS[LOG_LEVEL] ?? 2;

const maskPII = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const masked = { ...obj };
  
  if (masked.phone && typeof masked.phone === 'string') {
    masked.phone = masked.phone.replace(/.(?=.{3})/g, '*');
  }
  
  if (masked.email && typeof masked.email === 'string') {
    const [name, domain] = masked.email.split('@');
    if (domain) {
      masked.email = `${name[0]}***@${domain}`;
    }
  }

  for (const key in masked) {
    if (masked[key] && typeof masked[key] === 'object') {
      masked[key] = maskPII(masked[key]);
    }
  }
  return masked;
};

const log = (level, message, meta = {}) => {
  if ((LOG_LEVELS[level] ?? 2) > currentLogLevel) return;
  const safeMeta = maskPII(meta);
  const entry = { timestamp: new Date().toISOString(), level, message, ...safeMeta };
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(JSON.stringify(entry));
};
log.error = (msg, meta) => log('error', msg, meta);
log.warn = (msg, meta) => log('warn', msg, meta);
log.info = (msg, meta) => log('info', msg, meta);
log.debug = (msg, meta) => log('debug', msg, meta);

module.exports = log;
