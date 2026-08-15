/**
 * One user-facing failure message derivation for every tier.
 *
 * `Error` causes (tagged errors included) surface their message; string
 * causes surface themselves; everything else falls back to the caller's
 * copy instead of `String(cause)` artifacts like "[object Object]".
 * Messages are whitespace-normalized so multi-line internals never reach
 * the UI as ragged text.
 */
import { Predicate } from 'effect';

export const failureMessage = (cause: unknown, fallback = 'An unknown error occurred.'): string => {
  let message = '';
  if (cause instanceof Error) message = cause.message;
  else if (Predicate.isString(cause)) message = cause;
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (normalized.length > 0) return normalized;
  return fallback;
};
