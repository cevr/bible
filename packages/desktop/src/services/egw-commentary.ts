import { Context, Effect, Layer } from 'effect';

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
}

// Verse-keyed LRU — Notes/Commentary tabs both reopen against the same
// verse repeatedly as the user scrolls, so cache size mirrors the margin-
// notes cap.
const CAP = 128;

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

/** Renderer-side facade over the `bible:getEgwCommentary` IPC. Main owns
 *  the paragraph index in cache.sqlite; the renderer just asks per-verse
 *  and lists the hits. */
export class EgwCommentary extends Context.Service<EgwCommentary, EgwCommentaryShape>()(
  '@bible/desktop/services/EgwCommentary',
) {
  static layer = Layer.sync(EgwCommentary, () => {
    const lru = makeLru<readonly EgwCommentaryHit[]>(CAP);
    return {
      getCommentary: (book, chapter, verse) => {
        const key = `${String(book)}:${String(chapter)}:${String(verse)}`;
        const cached = lru.get(key);
        if (cached !== undefined) return Effect.succeed(cached);
        return Effect.promise(() => window.api.bible.getEgwCommentary(book, chapter, verse)).pipe(
          Effect.map((res) => {
            lru.set(key, res);
            return res;
          }),
        );
      },
    };
  });

  /** Fixture layer for tests — caller seeds verse → hits map. Anything not
   *  in the map returns `[]`. */
  static layerTest = (hits: ReadonlyMap<string, readonly EgwCommentaryHit[]>) =>
    Layer.succeed(EgwCommentary, {
      getCommentary: (book, chapter, verse) =>
        Effect.succeed(hits.get(`${String(book)}:${String(chapter)}:${String(verse)}`) ?? []),
    });
}
