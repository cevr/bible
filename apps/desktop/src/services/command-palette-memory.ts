import { Context, Effect, Layer, Ref } from 'effect';

// Ephemeral memory for the Cmd+K palette so re-opening it lands the user
// where they last navigated rather than reseeding from the current chapter.
//
// Persisted view shape mirrors the palette's internal view discriminant —
// 'root' / 'book' / 'chapter' — kept here without the `_tag` marker since
// the service doesn't care which view kind it is, only the (book, chapter)
// breadcrumb. The palette reconstructs the tagged view from this shape on
// open and writes it back on close.
//
// In-memory only (no disk persistence): the goal is jump-back-on-second-
// Cmd+K, not survival across launches. `LastPositionStorage` already
// handles that for the chapter cursor.

export interface PaletteSnapshot {
  /** When set, the palette opens in 'book' or 'chapter' view; absent => root. */
  readonly book?: number;
  /** When set alongside `book`, opens in 'chapter' view. */
  readonly chapter?: number;
  readonly query: string;
}

export interface CommandPaletteMemoryShape {
  readonly get: Effect.Effect<PaletteSnapshot | null>;
  readonly record: (snapshot: PaletteSnapshot) => Effect.Effect<void>;
  readonly clear: Effect.Effect<void>;
}

const make = Effect.gen(function* () {
  const ref = yield* Ref.make<PaletteSnapshot | null>(null);
  return {
    get: Ref.get(ref),
    record: (snapshot) => Ref.set(ref, snapshot),
    clear: Ref.set(ref, null),
  } satisfies CommandPaletteMemoryShape;
});

export class CommandPaletteMemory extends Context.Service<
  CommandPaletteMemory,
  CommandPaletteMemoryShape
>()('@bible/desktop/services/CommandPaletteMemory') {
  static layer = Layer.effect(CommandPaletteMemory, make);
}
