/**
 * Service catalogue and operating settings.
 *
 * WHY: the service list used to be a hard-coded array duplicated in all three
 * front ends while the backend validated nothing, so any string created a ticket
 * in a queue no staff member could ever see. Opening hours and slot capacity did
 * not exist at all. Both now live here, behind one source of truth that the admin
 * screen owns.
 */
const { getPool, getRedisClient, usingDb } = require('./connection');
const { DEFAULT_BUSINESS_SETTINGS, SETTINGS_KEY_BUSINESS } = require('../config/constants');

const SERVICES_KEY = 'services';
const SETTINGS_KEY = (key) => `settings:${key}`;

// Settings are read on every booking and check-in. Re-reading Postgres each time
// buys nothing, so hold them briefly and drop the copy whenever they are written.
const SETTINGS_CACHE_MS = 5000;
let settingsCache = null;
let settingsCachedAt = 0;

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeService = (service) => ({
  name: String(service.name || '').trim(),
  description: String(service.description || ''),
  counters: Math.max(1, toNumber(service.counters, 1)),
  // null means "derive capacity from counters"
  slotCapacity: service.slotCapacity === null || service.slotCapacity === undefined || service.slotCapacity === ''
    ? null
    : Math.max(1, toNumber(service.slotCapacity, 1)),
  isActive: service.isActive === undefined ? true : !!service.isActive
});

const rowToService = (row) => normalizeService({
  name: row.name,
  description: row.description,
  counters: row.counters,
  slotCapacity: row.slot_capacity,
  isActive: row.is_active
});

// ── services ────────────────────────────────────────────────────────────────

const listServices = async (options = {}) => {
  const includeInactive = !!options.includeInactive;

  if (usingDb()) {
    const result = await getPool().query('SELECT * FROM services ORDER BY name ASC');
    const services = result.rows.map(rowToService);
    return includeInactive ? services : services.filter((service) => service.isActive);
  }

  const client = getRedisClient();
  if (!client) return [];
  const raw = await client.hGetAll(SERVICES_KEY);
  const services = Object.values(raw)
    .map((value) => normalizeService(JSON.parse(value)))
    .sort((a, b) => a.name.localeCompare(b.name));
  return includeInactive ? services : services.filter((service) => service.isActive);
};

/**
 * Case-insensitive lookup, because a ticket typed as "general inquiry" must not
 * land in a second, invisible queue beside "General Inquiry".
 */
const getService = async (name) => {
  const wanted = String(name || '').trim().toLowerCase();
  if (!wanted) return null;
  const services = await listServices({ includeInactive: true });
  return services.find((service) => service.name.toLowerCase() === wanted) || null;
};

const createService = async (input) => {
  const service = normalizeService(input);

  if (usingDb()) {
    await getPool().query(
      `INSERT INTO services (name, description, counters, slot_capacity, is_active)
       VALUES ($1, $2, $3, $4, $5)`,
      [service.name, service.description, service.counters, service.slotCapacity, service.isActive]
    );
  } else {
    const client = getRedisClient();
    if (client) await client.hSet(SERVICES_KEY, service.name, JSON.stringify(service));
  }

  return service;
};

const updateService = async (name, patch) => {
  const existing = await getService(name);
  if (!existing) return null;

  const merged = normalizeService({
    ...existing,
    ...patch,
    // The name is the queue key on every existing ticket, so it is immutable.
    name: existing.name
  });

  if (usingDb()) {
    await getPool().query(
      `UPDATE services SET description = $2, counters = $3, slot_capacity = $4, is_active = $5
       WHERE name = $1`,
      [merged.name, merged.description, merged.counters, merged.slotCapacity, merged.isActive]
    );
  } else {
    const client = getRedisClient();
    if (client) await client.hSet(SERVICES_KEY, merged.name, JSON.stringify(merged));
  }

  return merged;
};

const deleteService = async (name) => {
  const existing = await getService(name);
  if (!existing) return false;

  if (usingDb()) {
    await getPool().query('DELETE FROM services WHERE name = $1', [existing.name]);
  } else {
    const client = getRedisClient();
    if (client) await client.hDel(SERVICES_KEY, existing.name);
  }

  return true;
};

const seedServices = async (defaults) => {
  const existing = await listServices({ includeInactive: true });
  if (existing.length > 0) return existing;
  for (const service of defaults) await createService(service);
  return listServices({ includeInactive: true });
};

// ── settings ────────────────────────────────────────────────────────────────

const readSettings = async (key) => {
  if (usingDb()) {
    const result = await getPool().query('SELECT value FROM app_settings WHERE key = $1', [key]);
    return result.rows[0] ? result.rows[0].value : null;
  }

  const client = getRedisClient();
  if (!client) return null;
  const raw = await client.get(SETTINGS_KEY(key));
  return raw ? JSON.parse(raw) : null;
};

const writeSettings = async (key, value) => {
  if (usingDb()) {
    await getPool().query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
  } else {
    const client = getRedisClient();
    if (client) await client.set(SETTINGS_KEY(key), JSON.stringify(value));
  }
};

/**
 * Operating policy, with every stored value layered over the seed defaults so a
 * settings row written before a new knob existed never yields `undefined`.
 */
const getBusinessSettings = async () => {
  if (settingsCache && Date.now() - settingsCachedAt < SETTINGS_CACHE_MS) return settingsCache;

  const stored = await readSettings(SETTINGS_KEY_BUSINESS);
  settingsCache = { ...DEFAULT_BUSINESS_SETTINGS, ...(stored || {}) };
  settingsCachedAt = Date.now();
  return settingsCache;
};

const saveBusinessSettings = async (patch) => {
  const current = await getBusinessSettings();
  const merged = { ...current, ...patch };

  merged.openDays = Array.isArray(merged.openDays)
    ? [...new Set(merged.openDays.map(Number).filter((day) => day >= 0 && day <= 6))].sort()
    : DEFAULT_BUSINESS_SETTINGS.openDays;
  merged.holidays = Array.isArray(merged.holidays)
    ? [...new Set(merged.holidays.map((day) => String(day).slice(0, 10)))].sort()
    : [];

  for (const [key, fallback] of Object.entries(DEFAULT_BUSINESS_SETTINGS)) {
    if (typeof fallback === 'number') merged[key] = toNumber(merged[key], fallback);
  }

  await writeSettings(SETTINGS_KEY_BUSINESS, merged);
  settingsCache = merged;
  settingsCachedAt = Date.now();
  return merged;
};

const invalidateSettingsCache = () => {
  settingsCache = null;
  settingsCachedAt = 0;
};

module.exports = {
  listServices,
  getService,
  createService,
  updateService,
  deleteService,
  seedServices,
  getBusinessSettings,
  saveBusinessSettings,
  invalidateSettingsCache
};
