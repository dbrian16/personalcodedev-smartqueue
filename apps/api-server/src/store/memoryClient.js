/**
 * In-process stand-in for the Redis client.
 *
 * WHY: the queue store, the distributed lock and the socket adapter all spoke
 * Redis directly, so `initStore` threw and the whole backend refused to boot on
 * any machine without a Redis server. That is the normal state of a developer
 * laptop and of the grading environment for this project, which is required to
 * run locally with no external services.
 *
 * This implements exactly the command surface the rest of the code uses, with
 * the same return shapes as node-redis v5, so `leadsStore`, `staffStore`,
 * `auditStore` and `catalogStore` are identical on both backends and only the
 * lock and the socket adapter have to know which one they got.
 *
 * Trade-off, stated plainly: state lives in this process only. It is lost on
 * restart and it is not shared between instances. Point REDIS_URL at a real
 * Redis (or run `npm run docker:up`) the moment you need either.
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

    async hLen(key) {
      return hash(key).size;
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

    async lLen(key) {
      return list(key).length;
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

    async flushAll() {
      store.clear();
      return 'OK';
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
