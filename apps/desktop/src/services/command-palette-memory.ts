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
//
// Plain module-level box. Previously wrapped in an Effect.Service with Ref
// + Layer, but no test layer ever used the injection point — the wrapping
// was Effect ceremony for what's already a process singleton.

export type PaletteSnapshot =
  | { readonly _tag: 'root'; readonly query: string }
  | { readonly _tag: 'book'; readonly book: number; readonly query: string }
  | {
      readonly _tag: 'chapter';
      readonly book: number;
      readonly chapter: number;
      readonly query: string;
    };

let snapshot: PaletteSnapshot | null = null;

export const commandPaletteMemory = {
  get: (): PaletteSnapshot | null => snapshot,
  record: (next: PaletteSnapshot): void => {
    snapshot = next;
  },
  clear: (): void => {
    snapshot = null;
  },
};
