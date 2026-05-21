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

export interface LastPositionStorageShape {
  /** `None` when no position has been persisted yet (first launch). */
  readonly read: Effect.Effect<Option.Option<LastPosition>>;
  readonly write: (position: LastPosition) => Effect.Effect<void>;
  readonly clear: Effect.Effect<void>;
}

/**
 * Persists "where the user was last reading" so the app reopens to that book
 * and chapter on launch. Single-row table in the same SQLite DB as the EGW
 * cache (it's already there, already opened on startup, and the position is
 * always paired with cached data anyway).
 *
 * app.tsx subscribes to ReaderState.changes and calls `write` on each
 * selection update; on mount it calls `read` once and replays the result into
 * ReaderState. Not put behind a debounce — selection changes only fire on
 * explicit user navigation (book click, chapter click, prev/next), not on
 * scroll, so the volume is fine for synchronous writes.
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
  });

  /** In-memory storage for tests. Backed by a single Ref. */
  static layerTest = (ref?: Ref.Ref<Option.Option<LastPosition>>) => {
    const cell = ref;
    return Layer.effect(
      LastPositionStorage,
      Effect.gen(function* () {
        const inner = cell ?? (yield* Ref.make<Option.Option<LastPosition>>(Option.none()));
        return {
          read: Ref.get(inner),
          write: (position) => Ref.set(inner, Option.some(position)),
          clear: Ref.set(inner, Option.none<LastPosition>()),
        } satisfies LastPositionStorageShape;
      }),
    );
  };
}
