const normalizeCategory = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : 'unknown';
};

export const failureCategory = (cause: unknown): string => {
  if (typeof cause !== 'object' || cause === null) return 'unknown';
  if ('_tag' in cause && typeof cause._tag === 'string') return normalizeCategory(cause._tag);
  if ('code' in cause && typeof cause.code === 'string') return normalizeCategory(cause.code);
  if ('name' in cause && typeof cause.name === 'string') return normalizeCategory(cause.name);
  return 'unknown';
};
