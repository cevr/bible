import { Context, Effect, Layer, Stream, SubscriptionRef } from 'effect';

export interface EgwCommentaryHit {
  readonly bookId: number;
  readonly bookCode: string;
  readonly bookTitle: string;
  readonly refcodeShort: string | null;
  readonly snippet: string;
  readonly puborder: number;
}

export interface EgwCommentaryShape {
  /** EGW paragraphs that reference the given Bible verse, ordered by book
   *  then paragraph order. Returns `[]` when no cached paragraph mentions
   *  the verse — the chapter cache populates the underlying index
   *  incrementally, so a cold install starts empty and grows as the user
   *  reads EGW chapters that touch the passage. */
  readonly getCommentary: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<readonly EgwCommentaryHit[]>;

  /** Verses in (book, chapter) that have at least one cached EGW paragraph
   *  referencing them. Used by the Bible chapter renderer to paint a
   *  footnote marker next to the verse number in one round-trip per
   *  chapter (mirrors the margin-notes `versesWithNotes` pattern). */
  readonly versesWithCommentary: (
    book: number,
    chapter: number,
  ) => Effect.Effect<ReadonlySet<number>>;

  /** Increments every time the indexer reports newly-cached EGW commentary.
   *  Subscribers (the chapter renderer) re-query `versesWithCommentary` for
   *  the chapter they're showing so footnote markers appear live without a
   *  reload. The payload is just a monotonic counter — the touched
   *  (book, chapter) keys are also invalidated in the LRU on the way out. */
  readonly changes: Stream.Stream<number>;
}

// Two caches keyed differently — per-verse hits (Commentary tab) and
// per-chapter hit sets (footnote markers). Sizes mirror margin-notes.
const PER_VERSE_CAP = 128;
const PER_CHAPTER_CAP = 32;

const makeLru = <V>(
  cap: number,
): {
  readonly get: (key: string) => V | undefined;
  readonly set: (key: string, value: V) => void;
  readonly delete: (key: string) => void;
  readonly clear: () => void;
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
    delete: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
};

/** Renderer-side facade over the `bible:getEgwCommentary` /
 *  `bible:getBibleVersesWithCommentary` IPC plus the
 *  `bible:egwCommentaryUpdated` event from the indexer. Main owns the
 *  paragraph index in cache.sqlite; the renderer queries per-verse /
 *  per-chapter and listens for "new commentary indexed" pulses. */
export class EgwCommentary extends Context.Service<EgwCommentary, EgwCommentaryShape>()(
  '@bible/desktop/services/EgwCommentary',
) {
  static layer = Layer.effect(
    EgwCommentary,
    Effect.gen(function* () {
      const verseLru = makeLru<readonly EgwCommentaryHit[]>(PER_VERSE_CAP);
      const chapterLru = makeLru<ReadonlySet<number>>(PER_CHAPTER_CAP);
      const pulse = yield* SubscriptionRef.make(0);

      // Wire the preload event listener to bump `pulse` after invalidating
      // the LRU entries for the (book, chapter) keys the indexer just
      // touched. Subscribers re-query and get fresh hit sets back. No
      // unsubscribe — this service lives for the lifetime of the renderer.
      //
      // Sentinel: an empty `touched` array means "wholesale invalidation"
      // (main fires this once after the cold-start backfill completes so
      // the renderer, which may have cached an empty hit set queried
      // before backfill finished, throws everything out and re-queries).
      window.api.bible.onEgwCommentaryUpdated((touched) => {
        if (touched.length === 0) {
          chapterLru.clear();
          verseLru.clear();
        } else {
          for (const t of touched) {
            chapterLru.delete(`${String(t.book)}:${String(t.chapter)}`);
          }
        }
        Effect.runSync(SubscriptionRef.update(pulse, (n) => n + 1));
      });

      return {
        getCommentary: (book: number, chapter: number, verse: number) => {
          const key = `${String(book)}:${String(chapter)}:${String(verse)}`;
          const cached = verseLru.get(key);
          if (cached !== undefined) return Effect.succeed(cached);
          return Effect.promise(() => window.api.bible.getEgwCommentary(book, chapter, verse)).pipe(
            Effect.map((res) => {
              verseLru.set(key, res);
              return res;
            }),
          );
        },
        versesWithCommentary: (book: number, chapter: number) => {
          const key = `${String(book)}:${String(chapter)}`;
          const cached = chapterLru.get(key);
          if (cached !== undefined) return Effect.succeed(cached);
          return Effect.promise(() =>
            window.api.bible.getBibleVersesWithCommentary(book, chapter),
          ).pipe(
            Effect.map((verses) => {
              const set: ReadonlySet<number> = new Set(verses);
              chapterLru.set(key, set);
              return set;
            }),
          );
        },
        changes: SubscriptionRef.changes(pulse),
      } satisfies EgwCommentaryShape;
    }),
  );

  /** Fixture layer for tests — caller seeds verse → hits and
   *  (book, chapter) → versesWithCommentary maps. Anything not in either
   *  map returns `[]` / empty Set. Changes stream emits a single 0 and
   *  stays idle. */
  static layerTest = (
    hits: ReadonlyMap<string, readonly EgwCommentaryHit[]>,
    chapters?: ReadonlyMap<string, ReadonlySet<number>>,
  ) =>
    Layer.succeed(EgwCommentary, {
      getCommentary: (book, chapter, verse) =>
        Effect.succeed(hits.get(`${String(book)}:${String(chapter)}:${String(verse)}`) ?? []),
      versesWithCommentary: (book, chapter) =>
        Effect.succeed(
          chapters?.get(`${String(book)}:${String(chapter)}`) ??
            (new Set<number>() as ReadonlySet<number>),
        ),
      changes: Stream.make(0),
    });
}
