import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, AUTH_BASE, Lead } from '@omni/shared';
import { queuePositionOf, apiGet, apiPost } from '@omni/shared-ui';

export const useKioskData = (options: {
  enabled: boolean;
  currentLead: Lead | null;
  setCurrentLead: (lead: Lead) => void;
  setQueuePosition: (pos: number) => void;
}) => {
  const leadRef = useRef<Lead | null>(null);
  leadRef.current = options.currentLead;

  const [token, setToken] = useState('');

  useEffect(() => {
    if (!options.enabled || !options.currentLead?.ticketNumber) {
      setToken('');
      return;
    }

    let cancelled = false;
    apiPost(`${AUTH_BASE}/api/auth/ticket-token`, { ticketNumber: options.currentLead.ticketNumber })
      .then((res) => {
        if (!cancelled) setToken(res.data.token || '');
      })
      .catch(() => {
        if (!cancelled) setToken('');
      });

    return () => {
      cancelled = true;
    };
  }, [options.enabled, options.currentLead?.ticketNumber]);

  const refreshQueueInfo = useCallback(async (tokenOverride?: string) => {
    const current = leadRef.current;
    const tokenToUse = tokenOverride || token;
    if (!current || !tokenToUse || !current.assignedPosition) return;

    try {
      const { data: posLeads } = await apiGet<Lead[]>(
        `${API_BASE}/leads?position=${encodeURIComponent(current.assignedPosition)}`,
        { headers: { Authorization: `Bearer ${tokenToUse}` } }
      );

      const position = queuePositionOf(posLeads, current);
      if (position > 0) {
        options.setQueuePosition(position);
        return;
      }

      // No longer waiting: the ticket has been called, served or closed, so the
      // useful thing to refresh is its status rather than its place in line.
      const updatedSelf = posLeads.find((lead) => lead.id === current.id);
      if (updatedSelf) options.setCurrentLead(updatedSelf);
    } catch {
      // A failed refresh leaves the last known state on screen; the socket
      // pushes the next change anyway.
    }
  }, [token, options]);

  return { token, refreshQueueInfo };
};
