/**
 * One user-facing failure message derivation for every tier.
 *
 * `Error` causes (tagged errors included) surface their message; string
 * causes surface themselves; everything else falls back to the caller's
 * copy instead of `String(cause)` artifacts like "[object Object]".
 * Messages are whitespace-normalized so multi-line internals never reach
 * the UI as ragged text.
 */
export const failureMessage = (cause: unknown, fallback = 'An unknown error occurred.'): string => {
  let message = '';
  if (cause instanceof Error) message = cause.message;
  else if (typeof cause === 'string') message = cause;
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (normalized.length > 0) return normalized;
  return fallback;
};
