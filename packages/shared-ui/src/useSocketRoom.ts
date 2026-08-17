import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

/**
 * The three events the server pushes. All optional: a screen subscribes only to
 * what it actually renders.
 */
export interface SocketHandlers<TLead> {
  lead_status_updated?: (lead: TLead) => void;
  new_lead?: () => void;
  queue_updated?: (allLeads: TLead[]) => void;
}

export interface SocketRoomOptions<TLead> {
  /**
   * Where the socket server lives. Passed in rather than imported so this
   * package stays free of build-time environment values — same reason
   * `useCatalog` takes its API base as an argument.
   */
  url: string;
  /** Skip connecting until there is something to listen for. */
  enabled: boolean;
  /** JWT for the handshake; the server derives the rooms to join from it. */
  token: string;
  /** Extra service line to follow, on top of whatever the token grants. */
  position?: string | null;
  handlers: SocketHandlers<TLead>;
}

/**
 * Joins the queue's live rooms for as long as the component is mounted.
 *
 * WHY this is shared: the kiosk and the online portal held near-identical copies
 * of this hook — the same reconnect settings, the same subscribe call, differing
 * only in a trailing comma and one event the online copy had quietly dropped —
 * and the staff console hand-rolled the same wiring a third time.
 *
 * Handlers are held in a ref on purpose: a parent that re-creates them each
 * render would otherwise tear the socket down and reconnect on every keystroke.
 */
export const useSocketRoom = <TLead,>(options: SocketRoomOptions<TLead>) => {
  const { url, enabled, token, position } = options;

  const handlersRef = useRef(options.handlers);
  handlersRef.current = options.handlers;

  useEffect(() => {
    if (!enabled || !token) return;

    const socket: Socket = io(url, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    if (position) socket.emit('subscribe_position', position);

    const onLeadStatusUpdated = (lead: TLead) => handlersRef.current.lead_status_updated?.(lead);
    const onNewLead = () => handlersRef.current.new_lead?.();
    const onQueueUpdated = (allLeads: TLead[]) => handlersRef.current.queue_updated?.(allLeads);

    socket.on('lead_status_updated', onLeadStatusUpdated);
    socket.on('new_lead', onNewLead);
    socket.on('queue_updated', onQueueUpdated);

    return () => {
      socket.off('lead_status_updated', onLeadStatusUpdated);
      socket.off('new_lead', onNewLead);
      socket.off('queue_updated', onQueueUpdated);
      socket.disconnect();
    };
  }, [url, enabled, token, position]);
};
