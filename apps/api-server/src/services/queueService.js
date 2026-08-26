const store = require('../store');
const socket = require('../socket');
const { nowUtc, toDateOrNull, addMinutes } = require('../utils/validators');
const log = require('../utils/logger');
const aiService = require('./aiService');
const businessService = require('./businessService');
const { LIVE_LEAD_STATUSES } = require('../config/constants');

/**
 * Emits the updated queue state to connected admins and staff for specific positions.
 * Scoped to the relevant socket rooms to keep traffic down and to avoid pushing a
 * queue to anyone not authorised to see it.
 *
 * @param {Array<string>} positions - Optional. specific positions to broadcast to.
 */
const emitQueueUpdated = async (positions = []) => {
  if (!socket.hasIo()) return;

  const allLeads = await store.listLeads(null, { includePending: false });
  const activeLeads = allLeads.filter((lead) => LIVE_LEAD_STATUSES.includes(lead.status));

  socket.emitToAdmins('queue_updated', activeLeads.map(store.publicLead));

  const targetPositions = positions.length > 0
    ? positions
    : [...new Set(activeLeads.map((lead) => lead.assignedPosition))];

  for (const position of targetPositions) {
    if (!position) continue;
    const leadsInTargetPosition = activeLeads.filter((lead) => lead.assignedPosition === position);
    socket.emitToPosition(position, 'queue_updated', leadsInTargetPosition.map(store.publicLead));
  }
};

/**
 * Helper function to calculate ETA for a specific position's waiting leads.
 *
 * @param {Array} positionLeads - Leads waiting in this position, in queue order
 * @param {string} positionName - The position/service name
 */
const calculateETAForPosition = async (positionLeads, positionName) => {
  const predictions = await aiService.getAIWaitPredictions(
    positionLeads.map((_, index) => index),
    positionName
  );

  const savePromises = positionLeads.map((lead, index) => {
    const prediction = predictions[index] || {
      estimatedWaitTimeMins: aiService.DEFAULT_AVERAGE_SERVICE_TIME_MINS,
      queueStatus: 'Medium'
    };
    lead.predictedWaitTime = prediction.estimatedWaitTimeMins;
    lead.queueStatus = prediction.queueStatus;
    // A lead cancelled between listing and writing must not fail the caller's
    // request, since an ETA refresh is best-effort by nature.
    return store.saveLead(lead).catch((error) => {
      log.warn('updateETA: could not save lead', { id: lead.id, error: error.message });
    });
  });
  await Promise.all(savePromises);
};

/**
 * Updates the Estimated Time of Arrival (ETA) for all waiting tickets.
 */
const updateAllETAs = async () => {
  const allLeads = await store.listLeads(null, { includePending: false });
  const waitingLeads = store.sortLeads(allLeads.filter((lead) => lead.status === 'Waiting'));
  const uniquePositions = [...new Set(waitingLeads.map((lead) => lead.assignedPosition))];

  await Promise.all(uniquePositions.map((position) => {
    const positionLeads = waitingLeads.filter((lead) => lead.assignedPosition === position);
    return calculateETAForPosition(positionLeads, position);
  }));

  await emitQueueUpdated();
};

/**
 * Saves a lead, recalculates ETAs, and broadcasts the updated lead to the rooms
 * that care about it.
 *
 * @param {Object} lead - The modified lead object to save
 * @returns {Object} The freshly updated lead from the database
 */
const saveAndBroadcastLead = async (lead) => {
  let updated = await store.saveLead(lead);
  await updateAllETAs(); // Recalculate ETAs since queue order might have changed

  // Re-fetch to ensure we have the absolute latest state
  updated = (await store.getLeadById(updated.id)) || updated;

  socket.broadcastLead(store.publicLead(updated));
  return updated;
};

/**
 * Moves a ticket to a terminal state and tells the interested rooms.
 * @param {Object} lead
 * @param {'Cancelled'|'No-Show'} status
 * @param {string} reason - Recorded on the ticket so the UI can explain itself.
 */
const closeLead = async (lead, status, reason) => {
  lead.status = status;
  lead.cancelReason = reason;
  const updated = await store.saveLead(lead);
  socket.broadcastLead(store.publicLead(updated));
  return updated;
};

/**
 * Background maintenance.
 *
 * Without it, every one of these states can only be left by a manual staff
 * action: a member of staff who closes their tab leaves a ticket in Called or
 * Serving forever, blocking the counter and never reaching the statistics.
 *
 * @returns {Promise<{expired: number, autoNoShow: number, alerted: number}>}
 */
const runQueueMaintenance = async () => {
  const now = nowUtc();
  const settings = await businessService.getSettings();
  const allLeads = await store.listLeads(null, { includePending: true });
  const result = { expired: 0, autoNoShow: 0, alerted: 0, closedOut: 0 };
  const today = businessService.localDateKey(now);

  for (const lead of allLeads) {
    try {
      // Serve everyone already issued, but not forever: without a day boundary a
      // ticket nobody got to yesterday reappears in this morning's queue ahead of
      // every customer actually standing there.
      if (LIVE_LEAD_STATUSES.includes(lead.status) && !settings.carryOverWaitingTickets) {
        const queuedOn = businessService.localDateKey(new Date(lead.effectiveQueueTime || lead.timestamp));
        if (queuedOn < today) {
          await closeLead(lead, 'Cancelled', 'not_served_before_closing');
          result.closedOut += 1;
          continue;
        }
      }

      if (lead.status === 'Pending') {
        // A late customer stays serviceable, so the reservation is only
        // abandoned once the downgrade window has also elapsed.
        const expiresAt = toDateOrNull(lead.pendingExpiresAt);
        if (!expiresAt) continue;
        const abandonAt = addMinutes(expiresAt, settings.lateDowngradeWindowMinutes);
        if (now.getTime() > abandonAt.getTime()) {
          await closeLead(lead, 'Cancelled', 'reservation_abandoned');
          result.expired += 1;
        }
        continue;
      }

      if (lead.status === 'Called') {
        const calledAt = toDateOrNull(lead.calledAt);
        if (!calledAt) continue;
        const deadline = addMinutes(calledAt, settings.calledTimeoutMinutes);
        if (now.getTime() > deadline.getTime()) {
          await closeLead(lead, 'No-Show', 'auto_no_show_timeout');
          result.autoNoShow += 1;
        }
        continue;
      }

      if (lead.status === 'Serving' && !lead.longSessionAlertedAt) {
        // Prompt a human, never close a consultation automatically.
        const servingAt = toDateOrNull(lead.servingAt);
        if (!servingAt) continue;
        const alertAt = addMinutes(servingAt, settings.longSessionAlertMinutes);
        if (now.getTime() > alertAt.getTime()) {
          lead.longSessionAlertedAt = now;
          const updated = await store.saveLead(lead);
          socket.emitToAdmins('long_session_alert', {
            ...store.publicLead(updated),
            minutesElapsed: Math.round((now.getTime() - servingAt.getTime()) / 60000)
          });
          result.alerted += 1;
        }
      }
    } catch (error) {
      // Per-lead isolation: one unwritable ticket must not stop the rest.
      log.warn('queueMaintenance: could not process lead', { id: lead.id, error: error.message });
    }
  }

  if (result.expired + result.autoNoShow + result.closedOut > 0) await updateAllETAs();

  return result;
};

/**
 * Computes timestamps for online ticket bookings.
 * `scheduledFor` has already been validated against opening hours, the booking
 * horizon and slot capacity by businessService.validateBookingTime.
 */
const computeOnlineTiming = async (scheduledFor) => {
  const settings = await businessService.getSettings();
  const now = nowUtc();
  const appointment = toDateOrNull(scheduledFor) || now;

  return {
    createdAt: now,
    scheduledFor: appointment,
    // The window a customer may walk up and check in within (A6 / A7).
    checkinOpensAt: addMinutes(appointment, -settings.checkinEarliestMinutes),
    pendingExpiresAt: addMinutes(appointment, settings.checkinGraceMinutes)
  };
};

module.exports = {
  updateAllETAs,
  runQueueMaintenance,
  computeOnlineTiming,
  saveAndBroadcastLead,
  closeLead
};
