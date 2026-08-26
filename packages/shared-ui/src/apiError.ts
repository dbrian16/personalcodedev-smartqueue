/**
 * The message the backend meant the user to read.
 *
 * The global error handler sends the reason as both `data.error` and
 * `data.message`, so both are checked here. Checking only one spelling falls
 * through to the generic fallback even when the server explained itself.
 *
 * @param error - Whatever landed in the catch block; nothing is assumed of it.
 * @param fallback - Shown when the server said nothing useful (offline, CORS, 500).
 */
export const apiErrorMessage = (error: unknown, fallback: string): string => {
  const data = (error as { response?: { data?: { error?: unknown; message?: unknown } } })?.response?.data;

  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (typeof data?.message === 'string' && data.message.trim()) return data.message;

  return fallback;
};
