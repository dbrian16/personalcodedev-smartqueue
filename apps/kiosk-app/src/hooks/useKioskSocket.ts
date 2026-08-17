import { useEffect, useRef } from 'react';
import { Lead, SOCKET_URL } from '@omni/shared';
import { useSocketRoom, queuePositionOf } from '@omni/shared-ui';
import { useKioskData } from './useKioskData';

export const useKioskSocket = (
  submitted: boolean,
  currentLead: Lead | null,
  setCurrentLead: (lead: Lead) => void,
  setQueuePosition: (pos: number) => void
) => {
  const enabled = !!submitted
    && !!currentLead?.ticketNumber
    && currentLead?.status !== 'Pending'
    && currentLead?.status !== 'Cancelled';

  const { token, refreshQueueInfo } = useKioskData({
    enabled,
    currentLead,
    setCurrentLead,
    setQueuePosition
  });

  const currentLeadRef = useRef<Lead | null>(null);
  currentLeadRef.current = currentLead;

  useSocketRoom<Lead>({
    url: SOCKET_URL,
    enabled,
    token,
    position: currentLead?.assignedPosition,
    handlers: {
      lead_status_updated: (updatedLead) => {
        const current = currentLeadRef.current;
        if (current && updatedLead.id === current.id) setCurrentLead(updatedLead);
        refreshQueueInfo();
      },
      new_lead: () => refreshQueueInfo(),
      queue_updated: (allLeads) => {
        const current = currentLeadRef.current;
        if (!current) return;

        const updatedSelf = allLeads.find((lead) => lead.id === current.id);
        if (updatedSelf) setCurrentLead(updatedSelf);

        const position = queuePositionOf(allLeads, current);
        if (position > 0) setQueuePosition(position);
      }
    }
  });

  useEffect(() => {
    if (!enabled || !token) return;
    refreshQueueInfo(token);
  }, [enabled, token, refreshQueueInfo]);
};
