export const formatScheduledLabel = (val: string) => {
  if (!val) return '';
  const d = new Date(val);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatDayLabel = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
};

/**
 * The ticket number carried by the kiosk QR code, if this page was opened from one.
 * Reading it from the query string is what turns a printed ticket into a live
 * tracker on the customer's own phone.
 */
export const readTicketFromUrl = (): string => {
  if (typeof window === 'undefined') return '';
  const value = new URLSearchParams(window.location.search).get('ticket');
  return value && /^TKT-\d+$/i.test(value.trim()) ? value.trim().toUpperCase() : '';
};

/** Drops the parameter so a refresh does not re-trigger the deep link. */
export const clearTicketFromUrl = () => {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  url.searchParams.delete('ticket');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
};

export const PHONE_REGEX = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{6,14}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
