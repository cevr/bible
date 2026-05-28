import { Context, Effect, Layer, Option, Ref } from 'effect';

// What the renderer cares about. The IPC bridge speaks snake_case
// (book_id, para_id) to match the SQLite column names; we translate at the
// service boundary so callers stay in camelCase.
//
// Discriminated by depth so a deeper anchor implies the shallower ones:
// `paragraph` carries paraId + paragraphId; `chapter` carries paraId; `book`
// has neither. Forbids the "paragraph anchor without chapter" combination the
// prior shape (paired Options) allowed.
export type LastPosition =
  | { readonly _tag: 'book'; readonly bookId: number }
  | { readonly _tag: 'chapter'; readonly bookId: number; readonly paraId: string }
  | {
      readonly _tag: 'paragraph';
      readonly bookId: number;
      readonly paraId: string;
      readonly paragraphId: string;
    };

// Bible-mode position. Verse is optional — a chapter the user opened without
// clicking a specific verse is still a valid place to restore to.
export type BibleLastPosition =
  | { readonly _tag: 'chapter'; readonly book: number; readonly chapter: number }
  | {
      readonly _tag: 'verse';
      readonly book: number;
      readonly chapter: number;
      readonly verse: number;
    };

export interface LastPositionStorageShape {
  /** `None` when no EGW position has been persisted yet (first launch). */
  readonly read: Effect.Effect<Option.Option<LastPosition>>;
  readonly write: (position: LastPosition) => Effect.Effect<void>;
  readonly clear: Effect.Effect<void>;
  /** `None` when no Bible position has been persisted yet. */
  readonly readBible: Effect.Effect<Option.Option<BibleLastPosition>>;
  readonly writeBible: (position: BibleLastPosition) => Effect.Effect<void>;
  readonly clearBible: Effect.Effect<void>;
}

/**
 * Persists "where the user was last reading" so the app reopens to that book
 * and chapter on launch. Single-row tables in the same SQLite DB as the EGW
 * cache (it's already there, already opened on startup, and the position is
 * always paired with cached data anyway).
 *
 * Two independent rows: `read/write/clear` is the EGW reader's position;
 * `readBible/writeBible/clearBible` is the Bible reader's. Stored separately
 * so switching modes on launch doesn't reset the other mode's place.
 *
 * app.tsx subscribes to ReaderState.changes + BibleReaderState.changes and
 * calls the matching write on each selection update; on mount it calls read
 * once per mode and replays the result. Not put behind a debounce — selection
 * changes only fire on explicit user navigation, not scroll, so the volume is
 * fine for synchronous writes.
 */
export class LastPositionStorage extends Context.Service<
  LastPositionStorage,
  LastPositionStorageShape
>()('@bible/desktop/services/LastPositionStorage') {
  static layer = Layer.succeed(LastPositionStorage, {
    read: Effect.promise(() => window.api.lastPosition.read()).pipe(
      Effect.map((row): Option.Option<LastPosition> => {
        if (row === null) return Option.none();
        if (row.para_id === null || row.para_id === undefined) {
          return Option.some({ _tag: 'book', bookId: row.book_id });
        }
        if (row.paragraph_id === null || row.paragraph_id === undefined) {
          return Option.some({ _tag: 'chapter', bookId: row.book_id, paraId: row.para_id });
        }
        return Option.some({
          _tag: 'paragraph',
          bookId: row.book_id,
          paraId: row.para_id,
          paragraphId: row.paragraph_id,
        });
      }),
    ),
    write: (position) =>
      Effect.promise(() =>
        window.api.lastPosition.write(
          position.bookId,
          position._tag === 'book' ? null : position.paraId,
          position._tag === 'paragraph' ? position.paragraphId : null,
        ),
      ),
    clear: Effect.promise(() => window.api.lastPosition.clear()),
    readBible: Effect.promise(() => window.api.bibleLastPosition.read()).pipe(
      Effect.map((row): Option.Option<BibleLastPosition> => {
        if (row === null) return Option.none();
        if (row.verse === null || row.verse === undefined) {
          return Option.some({ _tag: 'chapter', book: row.book, chapter: row.chapter });
        }
        return Option.some({
          _tag: 'verse',
          book: row.book,
          chapter: row.chapter,
          verse: row.verse,
        });
      }),
    ),
    writeBible: (position) =>
      Effect.promise(() =>
        window.api.bibleLastPosition.write(
          position.book,
          position.chapter,
          position._tag === 'verse' ? position.verse : null,
        ),
      ),
    clearBible: Effect.promise(() => window.api.bibleLastPosition.clear()),
  });

  /** In-memory storage for tests. Backed by two independent Refs (EGW + Bible). */
  static layerTest = (overrides?: {
    readonly egw?: Ref.Ref<Option.Option<LastPosition>>;
    readonly bible?: Ref.Ref<Option.Option<BibleLastPosition>>;
  }) =>
    Layer.effect(
      LastPositionStorage,
      Effect.gen(function* () {
        const egw = overrides?.egw ?? (yield* Ref.make<Option.Option<LastPosition>>(Option.none()));
        const bible =
          overrides?.bible ?? (yield* Ref.make<Option.Option<BibleLastPosition>>(Option.none()));
        return {
          read: Ref.get(egw),
          write: (position) => Ref.set(egw, Option.some(position)),
          clear: Ref.set(egw, Option.none<LastPosition>()),
          readBible: Ref.get(bible),
          writeBible: (position) => Ref.set(bible, Option.some(position)),
          clearBible: Ref.set(bible, Option.none<BibleLastPosition>()),
        } satisfies LastPositionStorageShape;
      }),
    );
}
