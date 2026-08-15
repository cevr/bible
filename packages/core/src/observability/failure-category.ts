/**
 * Stable log-category derivation from an unknown failure.
 *
 * Hosts and the shared app log failures as `[area] action key=value` lines
 * (see the repo observability convention); `failureCategory` turns any cause
 * into the `category=` value: the tagged error `_tag` when present, else a
 * `code` or `name`, normalized to a lowercase token. Pure and dependency-free
 * so every tier — Solid UI, browser worker, Bun server, Electron main — uses
 * the same taxonomy.
 */

const normalizeCategory = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (normalized.length > 0) return normalized;
  return 'unknown';
};

export const failureCategory = (cause: unknown): string => {
  if (typeof cause !== 'object' || cause === null) return 'unknown';
  if ('_tag' in cause && typeof cause._tag === 'string') return normalizeCategory(cause._tag);
  if ('code' in cause && typeof cause.code === 'string') return normalizeCategory(cause.code);
  if ('name' in cause && typeof cause.name === 'string') return normalizeCategory(cause.name);
  return 'unknown';
};
