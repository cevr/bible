// The lab's view: speed, loop, onion skin, compare, play, and the studio's
// beat. A lab write changes a scene file, and the page reloads to show it;
// the view comes back from the tab's store (`TabStore`, `browser/storage.ts`),
// as JSON under one key per film (`film-lab-view:<film>`). Each tool patches
// its part as it changes. Storage that is missing, throws or holds something
// that does not decode is the default view: the page still keeps what it was
// told while it lives, and only then does a reload start from the default.
// The loop the view keeps is a looped cue; the A–B range is the link's
// (`#loop=`, `lab/place.ts`), and a range a tab stored before the link held
// it is read and dropped.

import { Option, Schema } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import type { StoreRuntime } from '../browser/storage.ts';

/** The rates the lab plays at: the only ones a stored view may hold. */
export const RATES = [0.25, 0.5, 1] as const;

export const LabView = Schema.Struct({
  rate: Schema.Literals(RATES),
  loop: Schema.optionalKey(
    Schema.Union([
      Schema.Struct({ kind: Schema.Literal('cue'), scene: Schema.String, name: Schema.String }),
      /** A range a tab stored before the link held it: read, so the rest of its view decodes, and dropped. */
      Schema.Struct({ kind: Schema.Literal('ab'), from: Schema.Finite, to: Schema.Finite }),
    ]),
  ),
  onion: Schema.Struct({ on: Schema.Boolean, count: Schema.Finite, spacing: Schema.Finite }),
  /** The wipe's divider, this viewer's; the compare's mode is the link's (`?view=`). */
  compare: Schema.Struct({ split: Schema.Finite }),
  playing: Schema.Boolean,
  /** The page reloaded itself onto new code (a write's, a kept take's, the rebuild's): it flashes once as it lands (PA-11). */
  landed: Schema.optionalKey(Schema.Boolean),
  /**
   * The beat the studio records, and whether focus was in the studio (so its
   * keys still reach it), kept through the reload a take kept causes.
   */
  studio: Schema.optionalKey(
    Schema.Struct({ beat: Schema.String, focused: Schema.optionalKey(Schema.Boolean) }),
  ),
});
export type LabView = typeof LabView.Type;

export const DEFAULT_VIEW: LabView = {
  rate: 1,
  onion: { on: false, count: 2, spacing: 3 },
  compare: { split: 0.5 },
  playing: false,
};

/** A loop the view keeps: a cue's, or an A–B span. */
type ViewLoop = LabView extends { readonly loop?: infer L } ? L : never;

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

/** `view` with its looped cue, and no A–B range: a range is the link's (`#loop=`) now. */
const fitView = (view: LabView): LabView =>
  withLoop(
    view,
    Option.filter(Option.fromUndefinedOr(view.loop), (loop) => loop.kind === 'cue'),
  );

/**
 * The view of `film` kept in `store` (the tab's, `TabStore`): read once,
 * kept in memory, written through on each patch.
 */
export const viewStore = (film: string, store: StoreRuntime): ViewStore => {
  const kept = Atom.kvs({
    runtime: store,
    key: `film-lab-view:${film}`,
    schema: LabView,
    defaultValue: () => DEFAULT_VIEW,
    mode: 'sync',
  });
  const registry = AtomRegistry.make();
  registry.mount(kept);
  let view = fitView(registry.get(kept));
  return {
    get: () => view,
    patch: ({ loop, ...change }) => {
      const next: LabView = { ...view, ...change };
      view = Option.match(Option.fromUndefinedOr(loop), {
        onNone: () => next,
        onSome: (to) => withLoop(next, to),
      });
      registry.set(kept, view);
    },
  };
};
