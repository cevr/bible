import { Context, Effect, Layer, Option, Ref } from 'effect';

// What the renderer cares about. The IPC bridge speaks snake_case
// (book_id, para_id) to match the SQLite column names; we translate at the
// service boundary so callers stay in camelCase.
//
// `paragraphId` is the in-chapter scroll anchor — the paragraph that was at
// the top of the viewport when the user last looked. None when the user
// hasn't scrolled yet (or pre-scroll-spy data); restore falls back to chapter
// top in that case.
export interface LastPosition {
  readonly bookId: number;
  readonly paraId: Option.Option<string>;
  readonly paragraphId: Option.Option<string>;
}

// Bible-mode position. Verse is optional — a chapter the user opened without
// clicking a specific verse is still a valid place to restore to.
export interface BibleLastPosition {
  readonly book: number;
  readonly chapter: number;
  readonly verse: Option.Option<number>;
}

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
      Effect.map((row) =>
        row === null
          ? Option.none<LastPosition>()
          : Option.some({
              bookId: row.book_id,
              paraId: Option.fromNullishOr(row.para_id),
              paragraphId: Option.fromNullishOr(row.paragraph_id),
            }),
      ),
    ),
    write: (position) =>
      Effect.promise(() =>
        window.api.lastPosition.write(
          position.bookId,
          Option.getOrNull(position.paraId),
          Option.getOrNull(position.paragraphId),
        ),
      ),
    clear: Effect.promise(() => window.api.lastPosition.clear()),
    readBible: Effect.promise(() => window.api.bibleLastPosition.read()).pipe(
      Effect.map((row) =>
        row === null
          ? Option.none<BibleLastPosition>()
          : Option.some({
              book: row.book,
              chapter: row.chapter,
              verse: Option.fromNullishOr(row.verse),
            }),
      ),
    ),
    writeBible: (position) =>
      Effect.promise(() =>
        window.api.bibleLastPosition.write(
          position.book,
          position.chapter,
          Option.getOrNull(position.verse),
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
