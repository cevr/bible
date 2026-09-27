// The lab's view: speed, loop, onion skin, compare and play. A lab write
// changes a scene file, and the page reloads to show it; the view comes back
// from the tab's sessionStorage, under one key per film. Each tool patches its
// part as it changes. Storage that is missing, throws or holds something that
// does not decode is the default view: the page still keeps what it was told
// while it lives, and only then does a reload start from the default.

import { Option, Result, Schema } from 'effect';

export const LabView = Schema.Struct({
  rate: Schema.Finite,
  loop: Schema.optionalKey(
    Schema.Union([
      Schema.Struct({ kind: Schema.Literal('cue'), scene: Schema.String, name: Schema.String }),
      Schema.Struct({ kind: Schema.Literal('ab'), from: Schema.Finite, to: Schema.Finite }),
    ]),
  ),
  onion: Schema.Struct({ on: Schema.Boolean, count: Schema.Finite, spacing: Schema.Finite }),
  compare: Schema.Struct({
    mode: Schema.Literals(['off', 'wipe', 'blink']),
    split: Schema.Finite,
  }),
  playing: Schema.Boolean,
});
export type LabView = typeof LabView.Type;

export const DEFAULT_VIEW: LabView = {
  rate: 1,
  onion: { on: false, count: 2, spacing: 3 },
  compare: { mode: 'off', split: 0.5 },
  playing: false,
};

/** The part of `Storage` the view uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A change to the view: the keys it names; `loop: undefined` turns the loop off. */
export type ViewPatch = Partial<Omit<LabView, 'loop'>> & {
  readonly loop?: LabView['loop'] | undefined;
};

export interface ViewStore {
  get(): LabView;
  patch(change: ViewPatch): void;
}

const ViewJson = Schema.fromJsonString(LabView);
const decode = Schema.decodeUnknownOption(ViewJson);
const encode = Schema.encodeSync(ViewJson);

/** `run`'s value, or none when it throws (storage a private window or a full quota refuses). */
const attempt = <A>(run: () => A): Option.Option<A> => Result.getSuccess(Result.try(run));

/** The session's storage, when the page may use it. */
export const sessionStore = (): StorageLike | undefined =>
  Option.getOrUndefined(attempt(() => window.sessionStorage));

/** The view of `film` in this tab: read once, kept in memory, written through on each patch. */
export const viewStore = (film: string, storage: StorageLike | undefined): ViewStore => {
  const key = `film-lab-view:${film}`;
  let view: LabView = Option.getOrElse(
    Option.flatMap(
      Option.flatMap(Option.fromUndefinedOr(storage), (s) => attempt(() => s.getItem(key))),
      (raw) => Option.flatMap(Option.fromNullishOr(raw), decode),
    ),
    () => DEFAULT_VIEW,
  );
  return {
    get: () => view,
    patch: (change) => {
      const { loop, ...rest } = { ...view, ...change };
      const next: LabView = { ...rest };
      view = loop === undefined ? next : { ...next, loop };
      if (storage !== undefined) attempt(() => storage.setItem(key, encode(view)));
    },
  };
};
