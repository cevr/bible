/** Minimal in-memory LRU keyed by string, backed by a `Map` (insertion order
 *  is the LRU order). Three call sites in the desktop app each kept a private
 *  copy of this pattern — book-feed chapter cache, bible-chapter-canvas
 *  chapter cache, and EgwCommentary verse/chapter caches. The semantics are
 *  identical: `get` touches the entry to most-recently-used, `set` evicts the
 *  oldest entry when capacity is exceeded.
 *
 *  Intentionally NOT an Effect service — these caches are renderer-scoped
 *  module singletons that survive component remounts; wrapping each in a
 *  `Ref` would add Effect ceremony for zero benefit. */
export interface Lru<V> {
  readonly get: (key: string) => V | undefined;
  readonly has: (key: string) => boolean;
  readonly set: (key: string, value: V) => void;
  readonly delete: (key: string) => void;
  readonly clear: () => void;
  readonly size: () => number;
}

export const makeLru = <V>(capacity: number): Lru<V> => {
  const map = new Map<string, V>();
  return {
    get: (key) => {
      const v = map.get(key);
      if (v === undefined) return undefined;
      map.delete(key);
      map.set(key, v);
      return v;
    },
    has: (key) => map.has(key),
    set: (key, value) => {
      if (map.has(key)) map.delete(key);
      map.set(key, value);
      while (map.size > capacity) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    delete: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
    size: () => map.size,
  };
};
