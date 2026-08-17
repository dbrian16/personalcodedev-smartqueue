/**
 * The message the backend meant the user to read.
 *
 * WHY this is shared: `error.response?.data?.error || 'something failed'` was
 * written out in roughly twenty places across the three front ends, and half of
 * them forgot `data.message`. The global error handler always sends both fields,
 * so the two spellings are the same message — but a call site that checked only
 * one of them showed its generic fallback instead of the real reason.
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
