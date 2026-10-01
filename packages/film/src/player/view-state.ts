// The lab's view: speed, loop, onion skin, compare, play, and the studio's
// beat. A lab write
// changes a scene file, and the page reloads to show it; the view comes back
// from the tab's sessionStorage, under one key per film. Each tool patches its
// part as it changes. Storage that is missing, throws or holds something that
// does not decode is the default view: the page still keeps what it was told
// while it lives, and only then does a reload start from the default. A view
// is read against the film as it is now: the film may have got shorter since
// it was stored, so an A–B loop is clamped to the film, and dropped when
// nothing of it is left.

/** The rates the lab plays at: the only ones a stored view may hold. */
export const RATES = [0.25, 0.5, 1] as const;

import { Option, Result, Schema } from 'effect';

export const LabView = Schema.Struct({
  rate: Schema.Literals(RATES),
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
  compare: { mode: 'off', split: 0.5 },
  playing: false,
};

/** The part of `Storage` the view uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A change to the view: the keys it names; `loop: undefined` turns the loop off. */
type ViewPatch = Partial<Omit<LabView, 'loop'>> & {
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

/** `view` against a film `duration` seconds long: its A–B loop inside the film, or none. */
const fitView = (view: LabView, duration: number): LabView => {
  const { loop, ...rest } = view;
  if (loop === undefined || loop.kind === 'cue') return view;
  const from = Math.max(0, loop.from);
  const to = Math.min(duration, loop.to);
  if (to <= from) return rest;
  return { ...rest, loop: { kind: 'ab', from, to } };
};

/** The session's storage, when the page may use it. */
export const sessionStore = (): StorageLike | undefined =>
  Option.getOrUndefined(attempt(() => window.sessionStorage));

/**
 * The view of `film` (`duration` seconds long now) in this tab: read once and
 * fitted to the film, kept in memory, written through on each patch.
 */
export const viewStore = (
  film: string,
  storage: StorageLike | undefined,
  duration: number,
): ViewStore => {
  const key = `film-lab-view:${film}`;
  let view: LabView = Option.getOrElse(
    Option.flatMap(
      Option.flatMap(Option.fromUndefinedOr(storage), (s) => attempt(() => s.getItem(key))),
      (raw) => Option.flatMap(Option.fromNullishOr(raw), decode),
    ),
    () => DEFAULT_VIEW,
  );
  view = fitView(view, duration);
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
