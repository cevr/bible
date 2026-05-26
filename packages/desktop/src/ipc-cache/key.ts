/**
 * Cache key for a `(procedure path, arguments)` pair.
 *
 * The proxy walks a dotted path like `egw.fetchBooks` and accumulates args;
 * the registry uses `path` + a structural serialization of the resolved args
 * to dedupe subscribers across components. Two `ipc.egw.fetchBooks.query('en')`
 * calls anywhere in the tree resolve to the same entry; calling with `'de'`
 * gets a separate one.
 *
 * We use `JSON.stringify` with a deterministic replacer rather than
 * `Hash.hash` because Effect's array hash XORs element hashes (order-
 * insensitive) — that would collide `putChapter(1, '2')` with
 * `putChapter('2', 1)`. JSON.stringify is order-preserving, type-preserving
 * (numbers vs. strings serialize differently), and the resulting key is
 * human-readable in devtools.
 *
 * Object keys within args are sorted so `{a:1, b:2}` and `{b:2, a:1}` hash
 * the same. Functions in args would have already been resolved to values
 * by `resolveArg`, so we don't need to handle them here.
 */
export type CacheKey = string;

export const makeCacheKey = (path: string, resolvedArgs: readonly unknown[]): CacheKey =>
  `${path}:${JSON.stringify(resolvedArgs, sortedKeysReplacer)}`;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const sortedKeysReplacer = (_key: string, value: unknown): unknown => {
  if (!isPlainObject(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(value).sort()) {
    sorted[k] = value[k];
  }
  return sorted;
};
