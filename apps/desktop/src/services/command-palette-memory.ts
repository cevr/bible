import { Context, Effect, Layer, Ref } from 'effect';

// Ephemeral memory for the Cmd+K palette so re-opening it lands the user
// where they last navigated rather than reseeding from the current chapter.
//
// Persisted view shape mirrors the palette's internal view discriminant
// exactly — `_tag: 'root' | 'book' | 'chapter'` with the right fields
// per variant. Keeps {chapter:5, query:""} (chapter without book) from
// typechecking, and the palette can map snapshot → view by destructure.
//
// In-memory only (no disk persistence): the goal is jump-back-on-second-
// Cmd+K, not survival across launches. `LastPositionStorage` already
// handles that for the chapter cursor.

export type PaletteSnapshot =
  | { readonly _tag: 'root'; readonly query: string }
  | { readonly _tag: 'book'; readonly book: number; readonly query: string }
  | {
      readonly _tag: 'chapter';
      readonly book: number;
      readonly chapter: number;
      readonly query: string;
    };

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
