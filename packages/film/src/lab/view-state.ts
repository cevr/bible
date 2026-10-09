// The lab's view: speed, loop, onion skin, compare, play, and the studio's
// focus. A lab write changes a scene file, and the page reloads to show it;
// the view comes back from the tab's store (`TabStore`, `browser/storage.ts`),
// as JSON under one key per film (`film-lab-view:<film>`). Each tool patches
// its part as it changes. Storage that is missing, throws or holds something
// that does not decode is the default view: the page still keeps what it was
// told while it lives, and only then does a reload start from the default.
// The loop the view keeps is a looped cue; the A–B range is the link's
// (`#loop=`, `lab/place.ts`), and so is the studio's beat (`?beat=`). A
// stored loop that is not a looped cue reads as no loop, and the rest of
// the view still decodes.

import { Effect, Option, Schema } from 'effect';
import { type StoreRuntime, keptJson } from '../browser/storage.ts';

/** The rates the lab plays at: the only ones a stored view may hold. */
export const RATES = [0.25, 0.5, 1] as const;

/** The cue the view loops, by its scene and name. */
const LoopedCue = Schema.Struct({
  kind: Schema.Literal('cue'),
  scene: Schema.String,
  name: Schema.String,
});

export const LabView = Schema.Struct({
  rate: Schema.Literals(RATES),
  /** A stored loop that does not decode as a looped cue is no loop. */
  loop: Schema.optionalKey(LoopedCue.pipe(Schema.catchDecoding(() => Effect.succeedNone))),
  onion: Schema.Struct({ on: Schema.Boolean, count: Schema.Finite, spacing: Schema.Finite }),
  /** The wipe's divider, this viewer's; the compare's mode is the link's (`?view=`). */
  compare: Schema.Struct({ split: Schema.Finite }),
  playing: Schema.Boolean,
  /** The page reloaded itself onto new code (a write's, a kept take's, the rebuild's): it flashes once as it lands. */
  landed: Schema.optionalKey(Schema.Boolean),
  /**
   * Whether focus was in the studio (so its keys still reach it), kept through
   * the reload a take kept causes; the beat is the link's (`?beat=`).
   */
  studio: Schema.optionalKey(Schema.Struct({ focused: Schema.optionalKey(Schema.Boolean) })),
});
export type LabView = typeof LabView.Type;

export const DEFAULT_VIEW: LabView = {
  rate: 1,
  onion: { on: false, count: 2, spacing: 3 },
  compare: { split: 0.5 },
  playing: false,
};

/** The loop the view keeps: the looped cue. */
type ViewLoop = typeof LoopedCue.Type;

/** A change to the view: the keys it names; `loop: Option.none()` turns the loop off. */
type ViewPatch = Partial<Omit<LabView, 'loop'>> & {
  readonly loop?: Option.Option<ViewLoop>;
};

export interface ViewStore {
  get(): LabView;
  patch(change: ViewPatch): void;
}

/** `view` with `loop`, or with none. */
const withLoop = (view: LabView, loop: Option.Option<ViewLoop>): LabView => {
  const { loop: _was, ...rest } = view;
  return Option.match(loop, {
    onNone: () => rest,
    onSome: (kept) => ({ ...rest, loop: kept }),
  });
};

/**
 * The view of `film` kept in `store` (the tab's, `TabStore`): read once,
 * kept in memory, written through on each patch.
 */
export const viewStore = (film: string, store: StoreRuntime): ViewStore => {
  const kept = keptJson(store, `film-lab-view:${film}`, LabView, () => DEFAULT_VIEW);
  let view = kept.get();
  return {
    get: () => view,
    patch: ({ loop, ...change }) => {
      const next: LabView = { ...view, ...change };
      view = Option.match(Option.fromUndefinedOr(loop), {
        onNone: () => next,
        onSome: (to) => withLoop(next, to),
      });
      kept.set(view);
    },
  };
};
