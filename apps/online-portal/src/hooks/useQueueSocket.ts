import { Lead, SOCKET_URL } from '@omni/shared';
import { useSocketRoom } from '@omni/shared-ui';
import { useQueueData, PortalView } from './useQueueData';

export const useQueueSocket = (
  myLead: Lead | null,
  customerToken: string,
  setMyLead: (lead: Lead) => void,
  setView: (view: PortalView) => void,
  setQueuePosition: (pos: number) => void
) => {
  const { handlers } = useQueueData({ myLead, setMyLead, setView, setQueuePosition });

  useSocketRoom<Lead>({
    url: SOCKET_URL,
    enabled: !!myLead?.ticketNumber && !!customerToken,
    token: customerToken,
    position: myLead?.assignedPosition,
    handlers
  });
};
