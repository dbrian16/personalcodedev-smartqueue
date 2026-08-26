/**
 * AI Service Module
 *
 * Talks to the Python prediction engine and, just as importantly, keeps working
 * when it is not there: every call falls back to the analytic estimate so a dead
 * model can never block ticket issuance.
 *
 * It also owns the training loop. The wait estimate began as a single division
 * (queue depth × average service time ÷ staff on duty); the engine now learns
 * from completed tickets, and this is what feeds it.
 */
const config = require('../config');
const store = require('../store');
const log = require('../utils/logger');
const { ACTIVE_STAFF_STATUSES } = require('../config/constants');

/**
 * JSON in, JSON out, with a timeout. That is the whole surface this file needs
 * from the AI engine, so Node's own `fetch` covers it without an HTTP client.
 *
 * @param {string} url
 * @param {{method?: string, body?: Object, timeoutMs?: number}} [options]
 * @returns {Promise<Object>} The parsed JSON body.
 */
const fetchJson = async (url, { method = 'GET', body, timeoutMs } = {}) => {
  const response = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
  });
  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`);
  }
  return { data };
};

const DEFAULT_AVERAGE_SERVICE_TIME_MINS = Number(process.env.DEFAULT_AVERAGE_SERVICE_TIME_MINS || 5);
const MIN_AVERAGE_SERVICE_TIME_MINS = Number(process.env.MIN_AVERAGE_SERVICE_TIME_MINS || 1);
const MAX_AVERAGE_SERVICE_TIME_MINS = Number(process.env.MAX_AVERAGE_SERVICE_TIME_MINS || 60);
// Waits beyond this are treated as data-entry noise rather than signal.
const MAX_OBSERVED_WAIT_MINS = Number(process.env.MAX_OBSERVED_WAIT_MINS || 240);

/** The estimate the callers fall back to when there is nothing better to say. */
const NEUTRAL_PREDICTION = {
  estimatedWaitTimeMins: DEFAULT_AVERAGE_SERVICE_TIME_MINS,
  queueStatus: 'Medium',
  available: true,
  source: 'fallback'
};

const clampServiceTimeMins = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_AVERAGE_SERVICE_TIME_MINS;
  return Math.min(Math.max(numeric, MIN_AVERAGE_SERVICE_TIME_MINS), MAX_AVERAGE_SERVICE_TIME_MINS);
};

/**
 * The one place the busy-ness thresholds live. Mirrors `classify_queue_status`
 * in the Python engine, so the two must be changed together.
 *
 * @param {number} etaMins
 * @returns {string} 'Low' | 'Medium' | 'Busy'
 */
const queueStatusFor = (etaMins) => {
  if (etaMins < 10) return 'Low';
  if (etaMins <= 20) return 'Medium';
  return 'Busy';
};

const minutesBetween = (start, end) => {
  if (!start || !end) return null;

  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
  if (endTime <= startTime) return null;

  return (endTime - startTime) / 60000;
};

const isActiveStaffStatus = (status) => ACTIVE_STAFF_STATUSES.includes(String(status || '').toLowerCase());

/**
 * How many staff are actually on duty for a service line.
 *
 * Deliberately not floored at 1: zero is a real answer, and callers are expected
 * to report it rather than quote a wait for a ticket nobody can call.
 *
 * @param {string} position
 * @returns {Promise<number>} 0 when nobody is on duty.
 */
const getActiveStaffCount = async (position) => {
  if (!store.usingDb()) {
    const availability = await store.listAvailability();
    return availability.filter(
      (entry) => isActiveStaffStatus(entry.status) && entry.position === position
    ).length;
  }

  const { rows } = await store.getPool().query(
    `SELECT COUNT(*)::int AS cnt
     FROM staff_availability
     WHERE LOWER(status) = ANY($1)
       AND position = $2`,
    [ACTIVE_STAFF_STATUSES, position]
  );

  return rows && rows[0] ? Number(rows[0].cnt) : 0;
};

const getAverageServiceTimeMins = async (position) => {
  if (!store.usingDb()) {
    const allLeads = await store.listLeads(position, { includePending: true });
    const durations = allLeads
      .filter((lead) => lead.status === 'Completed' && lead.assignedPosition === position && lead.completedAt)
      .map((lead) => minutesBetween(lead.servingAt || lead.calledAt || lead.timestamp, lead.completedAt))
      .filter((mins) => Number.isFinite(mins) && mins >= MIN_AVERAGE_SERVICE_TIME_MINS);

    if (durations.length === 0) return DEFAULT_AVERAGE_SERVICE_TIME_MINS;

    return clampServiceTimeMins(durations.reduce((sum, mins) => sum + mins, 0) / durations.length);
  }

  // `session` is the served duration in minutes; naming it once keeps the
  // filter and the average from drifting apart.
  const { rows } = await store.getPool().query(
    `SELECT AVG(session_mins) AS avg_mins
     FROM (
       SELECT EXTRACT(EPOCH FROM (completed_at - COALESCE(serving_at, called_at, created_at))) / 60 AS session_mins
       FROM leads
       WHERE status = 'Completed'
         AND assigned_position = $1
         AND completed_at IS NOT NULL
     ) sessions
     WHERE session_mins > 0 AND session_mins >= $2`,
    [position, MIN_AVERAGE_SERVICE_TIME_MINS]
  );

  const avg = rows && rows[0] ? Number(rows[0].avg_mins) : null;

  return clampServiceTimeMins(avg || DEFAULT_AVERAGE_SERVICE_TIME_MINS);
};

/** Maps the engine's snake_case reply onto the shape the rest of the backend uses. */
const normaliseAIPrediction = (prediction) => {
  if (!prediction || typeof prediction !== 'object') {
    return { ...NEUTRAL_PREDICTION };
  }

  const eta = typeof prediction.estimated_wait_time_mins === 'number'
    ? prediction.estimated_wait_time_mins
    : typeof prediction.predicted_wait_time === 'number'
      ? prediction.predicted_wait_time
      : null;

  const reportedStatus = typeof prediction.queue_status === 'string' && prediction.queue_status.trim()
    ? prediction.queue_status
    : null;

  return {
    estimatedWaitTimeMins: eta === null ? 0 : eta,
    queueStatus: reportedStatus || (eta === null ? 'Unavailable' : queueStatusFor(eta)),
    // An unknown wait is not a zero-minute wait. The flag lets every screen
    // say "no counter open" instead of showing a reassuring number.
    available: prediction.available === undefined ? eta !== null : !!prediction.available,
    source: typeof prediction.source === 'string' ? prediction.source : 'analytic'
  };
};

/**
 * Local stand-in for the engine: the same queueing formula the Python service
 * uses as its baseline, so a missing AI engine changes accuracy, never behaviour.
 */
const analyticPrediction = (queuePosition, averageServiceTimeMins, activeStaff) => {
  const position = Math.max(0, Number(queuePosition) || 0);
  const staff = Math.max(0, Number(activeStaff) || 0);

  // Staff is checked before position: being first in line at a counter nobody
  // is sitting at is an unknown wait, not a zero-minute one.
  if (staff === 0) {
    return { estimatedWaitTimeMins: 0, queueStatus: 'Unavailable', available: false, source: 'fallback' };
  }

  const eta = position === 0 ? 0 : Math.round((position * averageServiceTimeMins) / staff);

  return {
    estimatedWaitTimeMins: eta,
    queueStatus: queueStatusFor(eta),
    available: true,
    source: 'fallback'
  };
};

/**
 * Gets wait time predictions from the AI engine for a batch of queue positions.
 * Falls back to the analytic estimate if the AI engine is unavailable.
 * @param {Array<number>} queuePositions - Places in line (0 = next to be served)
 * @param {string} positionName - The name of the service/position
 * @returns {Promise<Array<{estimatedWaitTimeMins: number, queueStatus: string, source: string}>>}
 */
const getAIWaitPredictions = async (queuePositions, positionName) => {
  if (!Array.isArray(queuePositions) || queuePositions.length === 0) return [];

  let activeStaff = 1;
  let averageServiceTimeMins = DEFAULT_AVERAGE_SERVICE_TIME_MINS;

  try {
    activeStaff = await getActiveStaffCount(positionName);
    averageServiceTimeMins = await getAverageServiceTimeMins(positionName);
  } catch (error) {
    log.warn('ai:context_unavailable', { error: error.message });
  }

  const fallback = () => queuePositions.map(
    (position) => analyticPrediction(position, averageServiceTimeMins, activeStaff)
  );

  if (!config.AI_ENGINE_URL) return fallback();

  try {
    const now = new Date();
    const { data } = await fetchJson(`${config.AI_ENGINE_URL}/predict_batch`, {
      method: 'POST',
      body: {
        queue_positions: queuePositions,
        average_service_time_mins: averageServiceTimeMins,
        active_staff: activeStaff,
        service_type: positionName,
        hour: now.getHours(),
        weekday: now.getDay()
      },
      timeoutMs: config.AI_ENGINE_TIMEOUT_MS
    });

    if (data && Array.isArray(data.predictions)) {
      return data.predictions.map(normaliseAIPrediction);
    }

    // Older engine builds answered with bare numbers rather than objects.
    if (data && Array.isArray(data.predicted_wait_times)) {
      return data.predicted_wait_times.map((eta) => normaliseAIPrediction({ estimated_wait_time_mins: eta }));
    }

    return fallback();
  } catch (error) {
    log.warn('ai_engine_unavailable_fallback', { error: error.message });
    return fallback();
  }
};

/**
 * Gets a wait time prediction from the AI engine for a single queue position.
 * @param {number} queuePosition - Places ahead in the queue
 * @param {string} positionName - The name of the service/position
 * @returns {Promise<{estimatedWaitTimeMins: number, queueStatus: string, source: string}>}
 */
const getAIWaitPrediction = async (queuePosition, positionName) => {
  const [prediction] = await getAIWaitPredictions([queuePosition], positionName);
  return prediction || { ...NEUTRAL_PREDICTION };
};

/**
 * Turns served tickets into supervised training rows.
 *
 * The label is the wait actually observed, from the moment the ticket became
 * queueable to the moment it was called, which is the quantity the ETA predicts.
 * The features are the conditions recorded at issue time, so the model learns
 * from what the system knew at prediction time rather than from hindsight.
 *
 * @returns {Promise<Array<Object>>}
 */
const buildTrainingSamples = async () => {
  const leads = await store.listLeads(null, { includePending: true });
  const samples = [];

  for (const lead of leads) {
    if (!lead.calledAt) continue;

    const queuedAtRaw = lead.effectiveQueueTime || lead.timestamp;
    const observedWait = minutesBetween(queuedAtRaw, lead.calledAt);
    if (!Number.isFinite(observedWait) || observedWait <= 0 || observedWait > MAX_OBSERVED_WAIT_MINS) continue;

    const queuedAt = new Date(queuedAtRaw);

    samples.push({
      queue_position: Number(lead.queuePositionAtCreation) || 0,
      active_staff: Number(lead.activeStaffAtCreation) || 1,
      average_service_time_mins: Number(lead.averageServiceTimeAtCreation) || DEFAULT_AVERAGE_SERVICE_TIME_MINS,
      hour: queuedAt.getHours(),
      weekday: queuedAt.getDay(),
      service_type: lead.assignedPosition,
      actual_wait_mins: Number(observedWait.toFixed(2))
    });
  }

  return samples;
};

/**
 * Ships the current history to the engine and asks it to refit.
 * Never throws: training is an optimisation, not part of any request path.
 * @returns {Promise<Object|null>} Training report, or null when skipped.
 */
const trainModel = async () => {
  if (!config.AI_ENGINE_URL) return null;

  try {
    const samples = await buildTrainingSamples();

    if (samples.length < config.AI_TRAINING_MIN_SAMPLES) {
      log.debug('ai:training_skipped', { samples: samples.length, required: config.AI_TRAINING_MIN_SAMPLES });
      return null;
    }

    const { data } = await fetchJson(`${config.AI_ENGINE_URL}/train`, {
      method: 'POST',
      body: { samples },
      timeoutMs: Math.max(config.AI_ENGINE_TIMEOUT_MS * 10, 15000)
    });

    log.info('ai:trained', data);
    return data;
  } catch (error) {
    log.warn('ai:training_failed', { error: error.message });
    return null;
  }
};

/**
 * Conditions at issue time, stored on the ticket so it can later become a
 * training row. Best-effort by design: a failure here must not block a ticket.
 *
 * @param {string} positionName
 * @param {number} queuePosition
 * @returns {Promise<Object>}
 */
const captureModelContext = async (positionName, queuePosition) => {
  try {
    return {
      queuePositionAtCreation: queuePosition,
      activeStaffAtCreation: await getActiveStaffCount(positionName),
      averageServiceTimeAtCreation: await getAverageServiceTimeMins(positionName)
    };
  } catch (error) {
    log.warn('ai:context_capture_failed', { error: error.message });
    return {
      queuePositionAtCreation: queuePosition,
      activeStaffAtCreation: 1,
      averageServiceTimeAtCreation: DEFAULT_AVERAGE_SERVICE_TIME_MINS
    };
  }
};

/** Asks the engine to describe the model it is currently serving predictions from. */
const getModelStatus = async () => {
  if (!config.AI_ENGINE_URL) return { available: false, reason: 'AI_ENGINE_URL not configured' };

  try {
    const { data } = await fetchJson(`${config.AI_ENGINE_URL}/model`, { timeoutMs: config.AI_ENGINE_TIMEOUT_MS });
    return { available: true, ...data };
  } catch (error) {
    return { available: false, reason: error.message };
  }
};

module.exports = {
  DEFAULT_AVERAGE_SERVICE_TIME_MINS,
  getAIWaitPredictions,
  getAIWaitPrediction,
  buildTrainingSamples,
  trainModel,
  captureModelContext,
  getModelStatus
};
