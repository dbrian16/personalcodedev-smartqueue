const catchAsync = require('../utils/catchAsync');
const store = require('../store');
const businessService = require('../services/businessService');
const { nowUtc } = require('../utils/validators');

/**
 * The public face of the service catalogue. The kiosk, the online portal and the
 * admin dashboard all read the service list from here, so a rename lands in one
 * place and no front end can invent a queue nobody serves.
 */
exports.getCatalog = catchAsync(async (_req, res) => {
  const [services, settings, availability] = await Promise.all([
    store.listServices(),
    businessService.getSettings(),
    store.listAvailability()
  ]);

  const now = nowUtc();
  const opening = businessService.describeOpening(now, settings);
  const lastTicketAt = opening.closesAt - settings.lastTicketBeforeCloseMinutes;

  // Staff actually signed in per service line. Published so a kiosk can warn
  // before issuing a ticket for a counter nobody is sitting at.
  const staffOnline = availability.reduce((counts, entry) => {
    if (!['online', 'busy'].includes(String(entry.status).toLowerCase())) return counts;
    counts[entry.position] = (counts[entry.position] || 0) + 1;
    return counts;
  }, {});

  res.json({
    services: services.map((service) => ({
      name: service.name,
      description: service.description,
      counters: service.counters,
      staffOnline: staffOnline[service.name] || 0
    })),
    hours: {
      openDays: settings.openDays,
      openTime: settings.openTime,
      closeTime: settings.closeTime,
      slotMinutes: settings.slotMinutes,
      bookingHorizonDays: settings.bookingHorizonDays,
      checkinEarliestMinutes: settings.checkinEarliestMinutes,
      checkinGraceMinutes: settings.checkinGraceMinutes
    },
    status: {
      open: opening.open,
      acceptingWalkIns: opening.open && businessService.minutesIntoDay(now) < lastTicketAt,
      lastWalkInTicketAt: businessService.formatClock(Math.max(0, lastTicketAt)),
      opensAt: businessService.formatClock(opening.opensAt),
      closesAt: businessService.formatClock(opening.closesAt)
    }
  });
});
