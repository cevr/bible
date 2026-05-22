import { Context, Effect, Layer } from 'effect';

export type XrefSource = 'openbible' | 'tske';

export interface CrossRef {
  readonly source: XrefSource;
  readonly targetBook: number;
  readonly targetChapter: number;
  readonly targetVerse: number;
  readonly targetVerseEnd: number | null;
}

export interface BibleXrefsShape {
  /** All cross references for a single source verse, across imported
   *  catalogs. Returns `[]` when no catalog has entries for the verse —
   *  the renderer surfaces an "no cross references" inline message. */
  readonly getCrossRefs: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<readonly CrossRef[]>;
}

// Cache keyed by "book:chapter:verse". A typical session re-opens the same
// verse many times (cursor nav + tab switching) so even a small LRU saves
// the IPC roundtrip + sqlite query on hot paths.
const LRU_CAP = 128;

const makeLru = <V>(): {
  readonly get: (key: string) => V | undefined;
  readonly set: (key: string, value: V) => void;
} => {
  const map = new Map<string, V>();
  return {
    get: (key) => {
      const v = map.get(key);
      if (v === undefined) return undefined;
      map.delete(key);
      map.set(key, v);
      return v;
    },
    set: (key, value) => {
      if (map.has(key)) map.delete(key);
      map.set(key, value);
      if (map.size > LRU_CAP) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
    },
  };
};

/** Renderer-side facade over the `bible:getCrossRefs` IPC. Main owns the
 *  catalogs in cache.sqlite; the renderer just asks per-verse and renders. */
export class BibleXrefs extends Context.Service<BibleXrefs, BibleXrefsShape>()(
  '@bible/desktop/services/BibleXrefs',
) {
  static layer = Layer.sync(BibleXrefs, () => {
    const lru = makeLru<readonly CrossRef[]>();
    return {
      getCrossRefs: (book, chapter, verse) => {
        const key = `${String(book)}:${String(chapter)}:${String(verse)}`;
        const cached = lru.get(key);
        if (cached !== undefined) return Effect.succeed(cached);
        return Effect.promise(() => window.api.bible.getCrossRefs(book, chapter, verse)).pipe(
          Effect.map((res) => {
            lru.set(key, res);
            return res;
          }),
        );
      },
    };
  });

  /** Fixture layer for tests — caller seeds a verse → refs map. Verses not
   *  in the map return `[]`. */
  static layerTest = (entries: ReadonlyMap<string, readonly CrossRef[]>) =>
    Layer.succeed(BibleXrefs, {
      getCrossRefs: (book, chapter, verse) =>
        Effect.succeed(entries.get(`${String(book)}:${String(chapter)}:${String(verse)}`) ?? []),
    });
}
