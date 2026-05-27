import { Context, Effect, Layer, Option } from 'effect';

export interface KjvChapter {
  readonly book: number;
  readonly bookName: string;
  readonly chapter: number;
  readonly verses: readonly { readonly verse: number; readonly text: string }[];
}

export interface KjvStrongsWord {
  readonly text: string;
  readonly strongs?: readonly string[];
}

export interface KjvStrongsChapter {
  readonly book: number;
  readonly bookName: string;
  readonly chapter: number;
  readonly verses: readonly {
    readonly verse: number;
    readonly words: readonly KjvStrongsWord[];
  }[];
}

export interface StrongsLexiconEntry {
  readonly code: string;
  readonly language: 'hebrew' | 'greek';
  readonly lemma: string;
  readonly transliteration: string;
  readonly definition: string;
}

/** Single concordance hit — book/chapter/verse plus the surface word the
 *  Strong's code was attached to in that verse (so the list shows e.g. that
 *  H776 surfaces as "earth" here and "land" there). */
export interface ConcordanceHit {
  readonly book: number;
  readonly bookName: string;
  readonly chapter: number;
  readonly verse: number;
  readonly text: string;
  readonly word: string;
}

export interface KjvBibleShape {
  /** Look up a KJV chapter by book number (1–66) and chapter number.
   *  Returns `None` for invalid combinations — the drawer surfaces this as a
   *  "verse not found" inline message rather than failing the IPC call. */
  readonly getChapter: (book: number, chapter: number) => Effect.Effect<Option.Option<KjvChapter>>;
  /** Same lookup with Strong's numbers per word. Lazy-loaded — first call
   *  triggers a ~21 MB JSON parse in the main process. */
  readonly getChapterStrongs: (
    book: number,
    chapter: number,
  ) => Effect.Effect<Option.Option<KjvStrongsChapter>>;
  /** Lexicon entry for a single Strong's code (H#### / G####). Lazy-loaded —
   *  first call triggers a ~3 MB JSON parse in main. `None` for unknown codes
   *  or malformed input. */
  readonly strongsLookup: (code: string) => Effect.Effect<Option.Option<StrongsLexiconEntry>>;
  /** Concordance lookup — every verse tagged with `code`. Capped server-side
   *  (currently 200) so high-frequency codes don't blow up the IPC payload. */
  readonly searchVersesByStrongs: (code: string) => Effect.Effect<readonly ConcordanceHit[]>;
  /** Distinct-verse total for `code`, independent of the capped hit list.
   *  Used so the UI can show "X of Y" even when the list is truncated. */
  readonly countStrongsHits: (code: string) => Effect.Effect<number>;
  /** Substring search across lemma / transliteration / definition for the
   *  English-side concordance flow. Capped server-side. */
  readonly searchLexicon: (query: string) => Effect.Effect<readonly StrongsLexiconEntry[]>;
  /** Drop the cached LRU/lexicon entries and ask main to drop + re-import
   *  the bundled KJV verses + Strong's lexicon. Used by the chapter canvas'
   *  "Reimport KJV" recovery flow when a chapter came back empty (typically
   *  a partial import left the table populated but incomplete). */
  readonly reimport: () => Effect.Effect<void>;
}

// Tiny LRU. 32 chapters covers prev/next traversal of a typical session
// without holding the whole Bible in memory. Map preserves insertion order,
// so we just delete + re-set to mark recency.
const LRU_CAP = 32;

const makeLru = <V>(): {
  readonly get: (key: string) => V | undefined;
  readonly set: (key: string, value: V) => void;
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
      if (map.size > LRU_CAP) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
    },
    clear: () => {
      map.clear();
    },
  };
};

/** Renderer-side facade over the `bible:getChapter` IPC. Main owns the JSON
 *  parse and the in-memory index so the renderer bundle stays small.
 *  Wraps an LRU so rapid prev/next clicks don't replay the IPC roundtrip. */
export class KjvBible extends Context.Service<KjvBible, KjvBibleShape>()(
  '@bible/desktop/services/KjvBible',
) {
  static layer = Layer.sync(KjvBible, () => {
    const plainLru = makeLru<KjvChapter>();
    const strongsLru = makeLru<KjvStrongsChapter>();
    const lexiconCache = new Map<string, StrongsLexiconEntry | null>();
    return {
      getChapter: (book, chapter) => {
        const key = `${String(book)}:${String(chapter)}`;
        const cached = plainLru.get(key);
        if (cached !== undefined) return Effect.succeed(Option.some(cached));
        return Effect.promise(() => window.api.bible.getChapter(book, chapter)).pipe(
          Effect.map((res) => {
            if (res === null || res === undefined) return Option.none<KjvChapter>();
            plainLru.set(key, res);
            return Option.some<KjvChapter>(res);
          }),
        );
      },
      getChapterStrongs: (book, chapter) => {
        const key = `${String(book)}:${String(chapter)}`;
        const cached = strongsLru.get(key);
        if (cached !== undefined) return Effect.succeed(Option.some(cached));
        return Effect.promise(() => window.api.bible.getChapterStrongs(book, chapter)).pipe(
          Effect.map((res) => {
            if (res === null || res === undefined) return Option.none<KjvStrongsChapter>();
            strongsLru.set(key, res);
            return Option.some<KjvStrongsChapter>(res);
          }),
        );
      },
      strongsLookup: (code) => {
        const cached = lexiconCache.get(code);
        if (cached !== undefined) return Effect.succeed(Option.fromNullishOr(cached));
        return Effect.promise(() => window.api.bible.strongsLookup(code)).pipe(
          Effect.map((res) => {
            lexiconCache.set(code, res ?? null);
            return Option.fromNullishOr(res);
          }),
        );
      },
      searchVersesByStrongs: (code) =>
        Effect.promise(() => window.api.bible.searchVersesByStrongs(code)),
      countStrongsHits: (code) => Effect.promise(() => window.api.bible.countStrongsHits(code)),
      searchLexicon: (query) => Effect.promise(() => window.api.bible.searchLexicon(query)),
      reimport: () =>
        Effect.promise(() => window.api.bible.reimportKjv()).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              plainLru.clear();
              strongsLru.clear();
              lexiconCache.clear();
            }),
          ),
        ),
    };
  });

  /** Fixture layer for tests — call sites can seed a small in-memory chapter
   *  set without touching IPC or the 7.5 MB JSON. */
  static layerTest = (
    chapters: readonly KjvChapter[],
    strongsChapters: readonly KjvStrongsChapter[] = [],
    lexicon: readonly StrongsLexiconEntry[] = [],
  ) =>
    Layer.succeed(KjvBible, {
      getChapter: (book, chapter) =>
        Effect.succeed(
          Option.fromNullishOr(chapters.find((c) => c.book === book && c.chapter === chapter)),
        ),
      getChapterStrongs: (book, chapter) =>
        Effect.succeed(
          Option.fromNullishOr(
            strongsChapters.find((c) => c.book === book && c.chapter === chapter),
          ),
        ),
      strongsLookup: (code) =>
        Effect.succeed(Option.fromNullishOr(lexicon.find((e) => e.code === code))),
      searchVersesByStrongs: () => Effect.succeed([]),
      countStrongsHits: () => Effect.succeed(0),
      searchLexicon: () => Effect.succeed([]),
      reimport: () => Effect.void,
    });
}
