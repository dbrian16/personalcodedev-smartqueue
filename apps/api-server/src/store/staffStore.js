const { getPool, getRedisClient, usingDb } = require('./connection');

const listAvailabilityDb = async () => {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM staff_availability ORDER BY staff_id ASC');
  return result.rows.map((row) => ({
    staffId: row.staff_id,
    status: row.status,
    position: row.position
  }));
};

const listAvailabilityRedis = async () => {
  const redisClient = getRedisClient();
  if (!redisClient) return [];
  const data = await redisClient.hGetAll('staff_availability');
  return Object.values(data).map(val => JSON.parse(val));
};

/**
 * Retrieves the current availability status of all staff members.
 * Tries DB first, then falls back to Redis.
 * @returns {Promise<Array<{staffId: string, status: string, position: string}>>} Array of availability objects.
 */
const listAvailability = async () => usingDb()
  ? listAvailabilityDb()
  : listAvailabilityRedis();

const saveAvailabilityDb = async ({ staffId, status, position }) => {
  const pool = getPool();
  await pool.query(
    `INSERT INTO staff_availability (staff_id, status, position, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (staff_id)
     DO UPDATE SET status = EXCLUDED.status, position = EXCLUDED.position, updated_at = NOW()`,
    [staffId, status, position]
  );
  return listAvailabilityDb();
};

const saveAvailabilityRedis = async ({ staffId, status, position }) => {
  const redisClient = getRedisClient();
  if (!redisClient) return [];
  const updatedStaff = { staffId, status, position };
  await redisClient.hSet('staff_availability', staffId, JSON.stringify(updatedStaff));
  return await listAvailabilityRedis();
};

/**
 * Updates the availability status and position of a specific staff member.
 * @param {Object} params
 * @param {string} params.staffId - The staff identifier
 * @param {string} params.status - 'online' | 'busy' | 'offline'
 * @param {string} params.position - The position name or 'Default'
 * @returns {Promise<Array>} The updated list of all staff availabilities.
 */
const saveAvailability = async ({ staffId, status, position }) => usingDb()
  ? saveAvailabilityDb({ staffId, status, position })
  : saveAvailabilityRedis({ staffId, status, position });

const getAllStaffAccounts = async () => {
  if (usingDb()) {
    const pool = getPool();
    const result = await pool.query('SELECT username, display_name as "displayName", service, role, is_active as "isActive", created_at as "createdAt" FROM staff_accounts ORDER BY username ASC');
    return result.rows;
  } else {
    const redisClient = getRedisClient();
    if (!redisClient) return [];
    const data = await redisClient.hGetAll('staff_accounts');
    const parsed = Object.values(data).map(val => JSON.parse(val));
    return parsed
      .map(({ password: _password, ...rest }) => rest)
      .sort((a, b) => String(a.username).localeCompare(String(b.username)));
  }
};

const getStaffAccount = async (username) => {
  if (usingDb()) {
    const pool = getPool();
    const result = await pool.query('SELECT username, password, display_name as "displayName", service, role, is_active as "isActive" FROM staff_accounts WHERE username = $1', [username]);
    return result.rows[0];
  } else {
    const redisClient = getRedisClient();
    if (!redisClient) return null;
    const data = await redisClient.hGet('staff_accounts', username);
    return data ? JSON.parse(data) : null;
  }
};

const createStaffAccount = async ({ username, password, displayName, service, role = 'staff' }) => {
  if (usingDb()) {
    const pool = getPool();
    await pool.query(
      'INSERT INTO staff_accounts (username, password, display_name, service, role) VALUES ($1, $2, $3, $4, $5)',
      [username, password, displayName, service, role]
    );
  } else {
    const redisClient = getRedisClient();
    if (redisClient) {
      await redisClient.hSet('staff_accounts', username, JSON.stringify({
        username, password, displayName, service, role, isActive: true
      }));
    }
  }
};

const updateStaffAccount = async (username, { password, displayName, service, isActive }) => {
  if (usingDb()) {
    const pool = getPool();
    const updates = [];
    const values = [username];
    let i = 2;
    if (password !== undefined) { updates.push(`password = $${i++}`); values.push(password); }
    if (displayName !== undefined) { updates.push(`display_name = $${i++}`); values.push(displayName); }
    if (service !== undefined) { updates.push(`service = $${i++}`); values.push(service); }
    if (isActive !== undefined) { updates.push(`is_active = $${i++}`); values.push(isActive); }
    
    if (updates.length > 0) {
      await pool.query(`UPDATE staff_accounts SET ${updates.join(', ')} WHERE username = $1`, values);
    }
  } else {
    const redisClient = getRedisClient();
    if (redisClient) {
      const data = await redisClient.hGet('staff_accounts', username);
      if (data) {
        const existing = JSON.parse(data);
        if (password !== undefined) existing.password = password;
        if (displayName !== undefined) existing.displayName = displayName;
        if (service !== undefined) existing.service = service;
        if (isActive !== undefined) existing.isActive = isActive;
        await redisClient.hSet('staff_accounts', username, JSON.stringify(existing));
      }
    }
  }
};

const deleteStaffAccount = async (username) => {
  if (usingDb()) {
    const pool = getPool();
    await pool.query('DELETE FROM staff_accounts WHERE username = $1', [username]);
  } else {
    const redisClient = getRedisClient();
    if (redisClient) {
      await redisClient.hDel('staff_accounts', username);
    }
  }
};

module.exports = {
  listAvailability,
  saveAvailability,
  getAllStaffAccounts,
  getStaffAccount,
  createStaffAccount,
  updateStaffAccount,
  deleteStaffAccount
};
