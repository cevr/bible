import { Context, Effect, Layer } from 'effect';

export type MarginNoteType = 'hebrew' | 'alternate' | 'other' | 'greek' | 'name';

export interface MarginNote {
  readonly idx: number;
  readonly type: MarginNoteType;
  readonly phrase: string;
  readonly text: string;
}

export interface BibleMarginNotesShape {
  /** All margin notes for a single verse, ordered by their original position
   *  in the asset. Returns `[]` when the verse has no annotations. */
  readonly getMarginNotes: (
    book: number,
    chapter: number,
    verse: number,
  ) => Effect.Effect<readonly MarginNote[]>;

  /** Verses in a (book, chapter) that have at least one margin note. Used
   *  by the chapter renderer to mark notable verses with a superscript
   *  anchor. */
  readonly versesWithNotes: (book: number, chapter: number) => Effect.Effect<ReadonlySet<number>>;

  /** All margin notes in (book, chapter), grouped by verse. Powers the
   *  inline-overlay path — anchors render next to the matched phrase rather
   *  than as a single leading verse marker. */
  readonly chapterMarginNotes: (
    book: number,
    chapter: number,
  ) => Effect.Effect<ReadonlyMap<number, readonly MarginNote[]>>;
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
    const chapterLru = makeLru<ReadonlySet<number>>(PER_CHAPTER_CAP);
    const chapterNotesLru = makeLru<ReadonlyMap<number, readonly MarginNote[]>>(PER_CHAPTER_CAP);
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
          Effect.map((verses) => {
            const out: ReadonlySet<number> = new Set(verses);
            chapterLru.set(key, out);
            return out;
          }),
        );
      },
      chapterMarginNotes: (book, chapter) => {
        const key = `${String(book)}:${String(chapter)}`;
        const cached = chapterNotesLru.get(key);
        if (cached !== undefined) return Effect.succeed(cached);
        return Effect.promise(() => window.api.bible.getChapterMarginNotes(book, chapter)).pipe(
          Effect.map((rows) => {
            const out = new Map<number, readonly MarginNote[]>();
            for (const r of rows) out.set(r.verse, r.notes);
            const readonly: ReadonlyMap<number, readonly MarginNote[]> = out;
            chapterNotesLru.set(key, readonly);
            return readonly;
          }),
        );
      },
    };
  });

  /** Fixture layer for tests — caller seeds verse → notes and
   *  (book, chapter) → versesWithNotes maps. Anything not in either map
   *  returns `[]` / empty Set. */
  static layerTest = (
    notes: ReadonlyMap<string, readonly MarginNote[]>,
    chapters: ReadonlyMap<string, ReadonlySet<number>>,
  ) =>
    Layer.succeed(BibleMarginNotes, {
      getMarginNotes: (book, chapter, verse) =>
        Effect.succeed(notes.get(`${String(book)}:${String(chapter)}:${String(verse)}`) ?? []),
      versesWithNotes: (book, chapter) =>
        Effect.succeed(
          chapters.get(`${String(book)}:${String(chapter)}`) ??
            (new Set<number>() as ReadonlySet<number>),
        ),
      chapterMarginNotes: (book, chapter) => {
        // Rebuild a per-verse map from the per-verse fixture data — the test
        // surface is small enough that a chapter-wide scan is cheap.
        const out = new Map<number, readonly MarginNote[]>();
        const prefix = `${String(book)}:${String(chapter)}:`;
        for (const [key, value] of notes) {
          if (!key.startsWith(prefix)) continue;
          const verseStr = key.slice(prefix.length);
          const verse = Number(verseStr);
          if (Number.isFinite(verse)) out.set(verse, value);
        }
        return Effect.succeed(out as ReadonlyMap<number, readonly MarginNote[]>);
      },
    });
}
