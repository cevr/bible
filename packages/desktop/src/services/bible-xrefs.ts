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

  /** Verses in (book, chapter) that have at least one cross-reference
   *  across imported catalogs. Used by the inline overlay to render an
   *  `x`-superscript marker on verses with xrefs in one round-trip per
   *  chapter (mirrors `versesWithNotes` / `versesWithCommentary`). */
  readonly versesWithCrossRefs: (
    book: number,
    chapter: number,
  ) => Effect.Effect<ReadonlySet<number>>;
}

// Cache keyed by "book:chapter:verse" for per-verse, "book:chapter" for the
// per-chapter marker set. A typical session re-opens the same verse many
// times (cursor nav + tab switching) so even a small LRU saves the IPC
// roundtrip + sqlite query on hot paths.
const PER_VERSE_CAP = 128;
const PER_CHAPTER_CAP = 32;

const makeLru = <V>(
  cap: number,
): {
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
      if (map.size > cap) {
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
    const verseLru = makeLru<readonly CrossRef[]>(PER_VERSE_CAP);
    const chapterLru = makeLru<ReadonlySet<number>>(PER_CHAPTER_CAP);
    return {
      getCrossRefs: (book, chapter, verse) => {
        const key = `${String(book)}:${String(chapter)}:${String(verse)}`;
        const cached = verseLru.get(key);
        if (cached !== undefined) return Effect.succeed(cached);
        return Effect.promise(() => window.api.bible.getCrossRefs(book, chapter, verse)).pipe(
          Effect.map((res) => {
            verseLru.set(key, res);
            return res;
          }),
        );
      },
      versesWithCrossRefs: (book, chapter) => {
        const key = `${String(book)}:${String(chapter)}`;
        const cached = chapterLru.get(key);
        if (cached !== undefined) return Effect.succeed(cached);
        return Effect.promise(() => window.api.bible.getVersesWithCrossRefs(book, chapter)).pipe(
          Effect.map((verses) => {
            const set: ReadonlySet<number> = new Set(verses);
            chapterLru.set(key, set);
            return set;
          }),
        );
      },
    };
  });

  /** Fixture layer for tests — caller seeds a verse → refs map. Verses not
   *  in the map return `[]`. */
  static layerTest = (
    entries: ReadonlyMap<string, readonly CrossRef[]>,
    chapters?: ReadonlyMap<string, ReadonlySet<number>>,
  ) =>
    Layer.succeed(BibleXrefs, {
      getCrossRefs: (book, chapter, verse) =>
        Effect.succeed(entries.get(`${String(book)}:${String(chapter)}:${String(verse)}`) ?? []),
      versesWithCrossRefs: (book, chapter) =>
        Effect.succeed(
          chapters?.get(`${String(book)}:${String(chapter)}`) ??
            (new Set<number>() as ReadonlySet<number>),
        ),
    });
}
