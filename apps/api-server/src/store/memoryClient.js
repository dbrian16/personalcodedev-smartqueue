/**
 * In-process stand-in for the Redis client, so the backend boots on a machine
 * with no Redis running. Covers the command surface the stores use, with
 * node-redis v5 return shapes.
 *
 * State lives in this process only: lost on restart, not shared between
 * instances. Point REDIS_URL at a real Redis when you need either.
 */
const MATCH_ALL = '*';

const globToRegExp = (pattern) => {
  const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
};

const createMemoryClient = () => {
  /** @type {Map<string, {value: *, expiresAt: number|null}>} */
  const store = new Map();

  const isExpired = (entry) => entry.expiresAt !== null && entry.expiresAt <= Date.now();

  const read = (key) => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (isExpired(entry)) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  };

  const write = (key, value, expiresAt = null) => {
    store.set(key, { value, expiresAt });
    return value;
  };

  /** Returns the hash at `key`, creating it if absent. */
  const hash = (key) => {
    const existing = read(key);
    if (existing instanceof Map) return existing;
    return write(key, new Map());
  };

  /** Returns the list at `key`, creating it if absent. */
  const list = (key) => {
    const existing = read(key);
    if (Array.isArray(existing)) return existing;
    return write(key, []);
  };

  const ttlFromOptions = (options) => {
    if (!options) return null;
    if (typeof options.PX === 'number') return Date.now() + options.PX;
    if (typeof options.EX === 'number') return Date.now() + options.EX * 1000;
    return null;
  };

  const client = {
    isMemory: true,
    isReady: true,
    isOpen: true,

    // ── strings / counters ────────────────────────────────────────────────
    async get(key) {
      const value = read(key);
      return value === undefined ? null : String(value);
    },

    async set(key, value, options) {
      if (options && options.NX && read(key) !== undefined) return null;
      if (options && options.XX && read(key) === undefined) return null;
      write(key, String(value), ttlFromOptions(options));
      return 'OK';
    },

    async incr(key) {
      const next = Number(read(key) || 0) + 1;
      const entry = store.get(key);
      write(key, String(next), entry ? entry.expiresAt : null);
      return next;
    },

    async expire(key, seconds) {
      const entry = store.get(key);
      if (!entry || isExpired(entry)) return 0;
      entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },

    async pExpire(key, milliseconds) {
      const entry = store.get(key);
      if (!entry || isExpired(entry)) return 0;
      entry.expiresAt = Date.now() + milliseconds;
      return 1;
    },

    async ttl(key) {
      const entry = store.get(key);
      if (!entry || isExpired(entry)) return -2;
      if (entry.expiresAt === null) return -1;
      return Math.ceil((entry.expiresAt - Date.now()) / 1000);
    },

    async del(...keys) {
      return keys.flat().reduce((count, key) => count + (store.delete(key) ? 1 : 0), 0);
    },

    async exists(key) {
      return read(key) === undefined ? 0 : 1;
    },

    // ── hashes ────────────────────────────────────────────────────────────
    async hGetAll(key) {
      return Object.fromEntries(hash(key).entries());
    },

    async hGet(key, field) {
      const value = hash(key).get(String(field));
      return value === undefined ? null : value;
    },

    async hSet(key, field, value) {
      const target = hash(key);
      const isNew = !target.has(String(field));
      target.set(String(field), String(value));
      return isNew ? 1 : 0;
    },

    async hSetNX(key, field, value) {
      const target = hash(key);
      if (target.has(String(field))) return false;
      target.set(String(field), String(value));
      return true;
    },

    async hExists(key, field) {
      return hash(key).has(String(field));
    },

    async hDel(key, field) {
      return hash(key).delete(String(field)) ? 1 : 0;
    },

    // ── lists ─────────────────────────────────────────────────────────────
    async rPush(key, value) {
      const target = list(key);
      target.push(String(value));
      return target.length;
    },

    async lRange(key, start, stop) {
      const target = list(key);
      const from = start < 0 ? Math.max(target.length + start, 0) : start;
      const to = stop < 0 ? target.length + stop : stop;
      return target.slice(from, to + 1);
    },

    async lTrim(key, start, stop) {
      const target = list(key);
      const from = start < 0 ? Math.max(target.length + start, 0) : start;
      const to = stop < 0 ? target.length + stop : stop;
      write(key, target.slice(from, to + 1));
      return 'OK';
    },

    // ── introspection / lifecycle ─────────────────────────────────────────
    async *scanIterator(options = {}) {
      const pattern = options.MATCH || MATCH_ALL;
      const matcher = globToRegExp(pattern);
      for (const key of [...store.keys()]) {
        if (read(key) !== undefined && matcher.test(key)) yield key;
      }
    },

    async ping() {
      return 'PONG';
    },

    async quit() {
      store.clear();
      client.isReady = false;
      client.isOpen = false;
      return 'OK';
    },

    on() {
      return client;
    }
  };

  return client;
};

module.exports = { createMemoryClient };
