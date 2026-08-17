import { useCallback, useEffect, useState } from 'react';
import type { Catalog } from '@omni/shared';

// The shapes live in @omni/shared, next to the Lead type the same endpoints
// return. They used to be declared a second time here, so the two copies could
// disagree about what /api/catalog answers with and nothing would flag it.
export type { Catalog, CatalogService, CatalogHours, CatalogStatus } from '@omni/shared';

const EMPTY: Catalog = {
  services: [],
  hours: {
    openDays: [1, 2, 3, 4, 5],
    openTime: '08:00',
    closeTime: '17:00',
    slotMinutes: 30,
    bookingHorizonDays: 7,
    checkinEarliestMinutes: 30,
    checkinGraceMinutes: 15
  },
  status: {
    open: false,
    acceptingWalkIns: false,
    lastWalkInTicketAt: '16:30',
    opensAt: '08:00',
    closesAt: '17:00'
  }
};

/**
 * Reads the service catalogue and opening hours from the backend.
 *
 * WHY this is shared: the service list used to be a hard-coded array copied into
 * the kiosk, the online portal and the staff console, so renaming a service meant
 * editing three front ends and any drift produced tickets in a queue nobody could
 * see. One fetch, one source of truth.
 *
 * The open/closed banner needs to change without a page reload — a kiosk screen
 * stays up all day — so the catalogue is re-read on an interval as well.
 */
export const useCatalog = (apiBase: string, refreshMs = 60000) => {
  const [catalog, setCatalog] = useState<Catalog>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/catalog`);
      if (!response.ok) throw new Error(`catalog request failed (${response.status})`);
      const data = (await response.json()) as Catalog;
      setCatalog(data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the service list.');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, refreshMs);
    return () => clearInterval(timer);
  }, [refresh, refreshMs]);

  return { catalog, services: catalog.services, loading, error, refresh };
};
