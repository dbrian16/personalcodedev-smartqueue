import { useRef } from 'react';
import { Lead } from '@omni/shared';
import { queuePositionOf, SocketHandlers } from '@omni/shared-ui';

export type PortalView = 'booking' | 'verify' | 'tracking' | 'feedback';

/** Statuses where the customer still has a place in the queue worth showing. */
const LIVE_STATUSES = ['Waiting', 'Called', 'Serving'];

export const useQueueData = (options: {
  myLead: Lead | null;
  setMyLead: (lead: Lead) => void;
  setView: (view: PortalView) => void;
  setQueuePosition: (pos: number) => void;
}) => {
  const myLeadRef = useRef<Lead | null>(null);
  myLeadRef.current = options.myLead;

  const handleStatusUpdate = (updatedLead: Lead) => {
    const current = myLeadRef.current;
    if (!current || updatedLead.id !== current.id) return;

    options.setMyLead(updatedLead);
    // Only invite a rating once, and only for a session that actually happened.
    if (updatedLead.status === 'Completed' && !updatedLead.hasFeedback) {
      options.setView('feedback');
    }
  };

  const handleQueueUpdate = (allLeads: Lead[]) => {
    const current = myLeadRef.current;
    if (!current) return;

    const updatedSelf = allLeads.find((lead) => lead.id === current.id);
    if (!updatedSelf) return;

    options.setMyLead(updatedSelf);

    if (LIVE_STATUSES.includes(updatedSelf.status)) {
      options.setQueuePosition(queuePositionOf(allLeads, updatedSelf));
    }
  };

  const handlers: SocketHandlers<Lead> = {
    lead_status_updated: handleStatusUpdate,
    queue_updated: handleQueueUpdate
  };

  return { handlers };
};
