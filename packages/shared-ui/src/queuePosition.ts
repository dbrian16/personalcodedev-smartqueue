/** The only fields the position calculation needs; keeps this usable from any app. */
interface QueueEntry {
  id: number;
  status: string;
  assignedPosition: string;
}

/**
 * Where a ticket stands in its own service line, counting from 1.
 *
 * Relies on the array already being in the server's queue order. Returns 0 when
 * the ticket is no longer waiting, which callers render as a dash.
 *
 * @param leads - Leads as the server ordered them (effective queue time).
 * @param lead - The ticket to locate.
 */
export const queuePositionOf = <T extends QueueEntry>(leads: T[], lead: QueueEntry): number => {
  const waiting = leads.filter(
    (item) => item.status === 'Waiting' && item.assignedPosition === lead.assignedPosition
  );
  const index = waiting.findIndex((item) => item.id === lead.id);

  return index === -1 ? 0 : index + 1;
};
