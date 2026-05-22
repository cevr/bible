import { Context, Effect, Layer } from 'effect';

export type MarginNoteType = 'hebrew' | 'alternate' | 'other' | 'greek' | 'name';

export interface MarginNote {
  readonly idx: number;
  readonly type: MarginNoteType;
  readonly phrase: string;
  readonly text: string;
}

export interface VerseWithNotes {
  readonly verse: number;
  readonly count: number;
}

export interface BibleMarginNotesShape {
  /** All margin notes for a single verse, ordered by their original position
   *  in the asset. Returns `[]` when the verse has no annotations. */
  readonly getMarginNotes: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<readonly MarginNote[]>;

  /** Verses in a (book, chapter) that have at least one margin note, with
   *  counts. Used by the chapter renderer to mark notable verses with a
   *  superscript anchor. Returns a Map keyed by verse number. */
  readonly versesWithNotes: (
    book: number,
    chapter: number,
  ) => Effect.Effect<ReadonlyMap<number, number>>;
}

// Two caches keyed differently because the lookups have different scopes:
//   - per-verse notes are queried whenever the user opens the Notes tab on a
//     specific verse, often the same verse multiple times in a row;
//   - per-chapter verse-marker maps are queried once per chapter render and
//     then re-used while the user navigates within the chapter.
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

/** Renderer-side facade over the `bible:getMarginNotes` /
 *  `bible:getVersesWithNotes` IPC. Main owns the catalog in cache.sqlite;
 *  the renderer just asks per-verse / per-chapter and renders. */
export class BibleMarginNotes extends Context.Service<BibleMarginNotes, BibleMarginNotesShape>()(
  '@bible/desktop/services/BibleMarginNotes',
) {
  static layer = Layer.sync(BibleMarginNotes, () => {
    const verseLru = makeLru<readonly MarginNote[]>(PER_VERSE_CAP);
    const chapterLru = makeLru<ReadonlyMap<number, number>>(PER_CHAPTER_CAP);
    return {
      getMarginNotes: (book, chapter, verse) => {
        const key = `${String(book)}:${String(chapter)}:${String(verse)}`;
        const cached = verseLru.get(key);
        if (cached !== undefined) return Effect.succeed(cached);
        return Effect.promise(() => window.api.bible.getMarginNotes(book, chapter, verse)).pipe(
          Effect.map((res) => {
            verseLru.set(key, res);
            return res;
          }),
        );
      },
      versesWithNotes: (book, chapter) => {
        const key = `${String(book)}:${String(chapter)}`;
        const cached = chapterLru.get(key);
        if (cached !== undefined) return Effect.succeed(cached);
        return Effect.promise(() => window.api.bible.getVersesWithNotes(book, chapter)).pipe(
          Effect.map((rows) => {
            const map = new Map<number, number>();
            for (const r of rows) map.set(r.verse, r.count);
            const out: ReadonlyMap<number, number> = map;
            chapterLru.set(key, out);
            return out;
          }),
        );
      },
    };
  });

  /** Fixture layer for tests — caller seeds verse → notes and
   *  (book, chapter) → versesWithNotes maps. Anything not in either map
   *  returns `[]` / empty Map. */
  static layerTest = (
    notes: ReadonlyMap<string, readonly MarginNote[]>,
    chapters: ReadonlyMap<string, ReadonlyMap<number, number>>,
  ) =>
    Layer.succeed(BibleMarginNotes, {
      getMarginNotes: (book, chapter, verse) =>
        Effect.succeed(notes.get(`${String(book)}:${String(chapter)}:${String(verse)}`) ?? []),
      versesWithNotes: (book, chapter) =>
        Effect.succeed(
          chapters.get(`${String(book)}:${String(chapter)}`) ??
            (new Map<number, number>() as ReadonlyMap<number, number>),
        ),
    });
}
