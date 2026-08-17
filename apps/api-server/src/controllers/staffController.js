const catchAsync = require('../utils/catchAsync');
const store = require('../store');
const queueService = require('../services/queueService');
const businessService = require('../services/businessService');
const { nowUtc } = require('../utils/validators');
const { withQueueLock } = require('../utils/redlock');
const { throwError } = require('../utils/AppError');
const { assertMayServe, assertMayActOnLead, noteCoverage } = require('../services/staffAccessService');

// A counter action is a human pressing a button, so it holds the lock briefly
// and reports contention rather than making them wait for it.
const TICKET_LOCK = { ttlMs: 3000, busyMessage: 'This ticket is being updated. Please try again in a moment.' };
const LINE_LOCK = {
  ttlMs: 3000,
  busyMessage: 'Another counter is being served for this service line. Please try again in a moment.'
};

/**
 * Calls the next waiting ticket for a service line.
 *
 * Normally the caller's own line; pass `coveringFor: true` to stand in for
 * another counter.
 */
exports.callNextLead = catchAsync(async (req, res) => {
  const position = typeof req.body.position === 'string' ? req.body.position.trim() : '';
  if (!position) throwError('position is required');

  const service = await businessService.requireService(position);
  const settings = await businessService.getSettings();
  const covering = assertMayServe(req.user, service.name, {
    coveringFor: settings.allowCrossCounterCalls && !!req.body.coveringFor
  });

  const result = await withQueueLock(`queue:position:${service.name}`, LINE_LOCK, async () => {
    const leadsInPosition = await store.listLeads(service.name, { includePending: false });
    const candidates = store.sortLeads(leadsInPosition.filter((lead) => lead.status === 'Waiting'));

    if (candidates.length === 0) throwError('No waiting tickets for this position', 404);

    const chosen = candidates[0];
    chosen.status = 'Called';
    chosen.staff = String(req.user.userId || 'staff');
    chosen.calledAt = nowUtc();
    chosen.recallCount = 0;

    const updated = await queueService.saveAndBroadcastLead(chosen);
    if (covering) noteCoverage(req.user, service.name, 'call-next', updated.ticketNumber);
    return updated;
  });

  res.json({ ...result, coveringFor: covering ? service.name : undefined });
});

/**
 * Recalls a customer who did not appear the first time.
 *
 * Two recalls, then the ticket becomes a no-show. Without a
 * cap a single ticket could be recalled indefinitely and block the counter.
 */
exports.recallLead = catchAsync(async (req, res) => {
  const settings = await businessService.getSettings();

  const result = await withQueueLock(`queue:lead:${req.params.id}`, TICKET_LOCK, async () => {
    const lead = await store.getLeadById(req.params.id);
    if (!lead) throwError('Lead not found', 404);

    const covering = assertMayActOnLead(req.user, lead, {
      coveringFor: settings.allowCrossCounterCalls && !!req.body.coveringFor
    });
    if (covering) noteCoverage(req.user, lead.assignedPosition, 'recall', lead.ticketNumber);

    if (lead.status !== 'Called' && lead.status !== 'No-Show') {
      throwError('Only Called or No-Show tickets can be recalled');
    }

    const nextRecallCount = (lead.recallCount || 0) + 1;

    if (nextRecallCount > settings.maxRecalls) {
      lead.recallCount = nextRecallCount;
      const closed = await queueService.closeLead(lead, 'No-Show', 'recall_limit_reached');
      await queueService.updateAllETAs();
      return {
        ...store.publicLead(closed),
        autoNoShow: true,
        message: `Recalled ${settings.maxRecalls} times without an answer — marked as No-Show.`
      };
    }

    lead.status = 'Called';
    lead.recallCount = nextRecallCount;
    lead.calledAt = nowUtc();

    return queueService.saveAndBroadcastLead(lead);
  });

  res.json(result);
});

/**
 * Marks a ticket as No-Show.
 */
exports.markNoShow = catchAsync(async (req, res) => {
  const settings = await businessService.getSettings();

  const result = await withQueueLock(`queue:lead:${req.params.id}`, TICKET_LOCK, async () => {
    const lead = await store.getLeadById(req.params.id);
    if (!lead) throwError('Lead not found', 404);

    const covering = assertMayActOnLead(req.user, lead, {
      coveringFor: settings.allowCrossCounterCalls && !!req.body.coveringFor
    });
    if (covering) noteCoverage(req.user, lead.assignedPosition, 'no-show', lead.ticketNumber);
    if (lead.status !== 'Called') throwError('Only Called tickets can be marked No-Show');

    const closed = await queueService.closeLead(lead, 'No-Show', 'marked_by_staff');
    await queueService.updateAllETAs();
    return store.publicLead(closed);
  });

  res.json(result);
});
