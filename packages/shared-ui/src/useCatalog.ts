import { useCallback, useEffect, useState } from 'react';
import type { Catalog } from '@omni/shared';

// Re-exported from @omni/shared, where they sit next to the Lead type the same
// endpoints return. Declaring them again here would let the two drift.
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
 * Reads the service catalogue and opening hours from the backend, so all three
 * front ends resolve the service list from one source.
 *
 * A kiosk screen stays up all day, so the catalogue is also re-read on an
 * interval to keep the open/closed banner current without a page reload.
 *
 * @param apiBase - Base URL of the API.
 * @param refreshMs - How often to re-read the catalogue.
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
