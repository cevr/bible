// The compare with HEAD, as one machine: off, wipe (HEAD left of a divider
// the pointer drags, clamped to the frame), blink (HEAD and now flip every
// BLINK_MS, starting on HEAD: a state timeout, re-entered on each flip, so
// the timer is the actor's and stops with the state), or diff (HEAD whole
// over the frame in the difference blend: black where nothing moved, the
// pixels an edit moved lit; PA-9). A blink is also flipped by hand: held
// (press and hold on the frame) HEAD shows and the timer waits; let go, now
// shows and the timer runs again. The divider keeps its place across modes.
// The mode is the link's (`?view=`); the divider is this viewer's, kept
// through a reload (`view-state.ts`).
//
//   Off | Wipe | Blink | Held | Diff ─Choose→ Off | Wipe | Blink | Diff
//   Wipe ─Split→ Wipe        Blink ─Flip (every BLINK_MS)→ Blink
//   Blink ─Hold on→ Held ─Hold off→ Blink (now)

import { Duration, Effect, Match, Option, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { COMPARE_VIEWS } from '../../core/api.ts';
import type { LabView } from '../view-state.ts';

/** How long each side of a blink shows. */
export const BLINK_MS = 450;

export const CompareMode = Schema.Literals(COMPARE_VIEWS);
export type CompareMode = typeof CompareMode.Type;

export const CompareState = State({
  Off: { split: Schema.Finite },
  /** HEAD left of the divider at `split` (0–1 across the frame), now right of it. */
  Wipe: { split: Schema.Finite },
  /** HEAD shows while `head`, now otherwise. */
  Blink: { split: Schema.Finite, head: Schema.Boolean },
  /** A blink held on HEAD by hand: no timer runs. */
  Held: { split: Schema.Finite },
  /** HEAD over now in the difference blend. */
  Diff: { split: Schema.Finite },
});
export type CompareState = typeof CompareState.Type;

export const CompareEvent = Event({
  Choose: { mode: CompareMode },
  /** The divider dragged to `split`, 0–1 across the frame. */
  Split: { split: Schema.Finite },
  Flip: {},
  /** A press on the frame held (`on`) or let go, in a blink. */
  Hold: { on: Schema.Boolean },
});
export type CompareEvent = typeof CompareEvent.Type;

const ANY = [
  CompareState.Off,
  CompareState.Wipe,
  CompareState.Blink,
  CompareState.Held,
  CompareState.Diff,
] as const;

/** The state `mode` shows, the divider at `split`. */
const entered = (mode: CompareMode, split: number): CompareState =>
  Match.value(mode).pipe(
    Match.when('off', () => CompareState.Off({ split })),
    Match.when('wipe', () => CompareState.Wipe({ split })),
    Match.when('diff', () => CompareState.Diff({ split })),
    Match.orElse(() => CompareState.Blink({ split, head: true })),
  );

/** The compare machine, starting in `initial` (the link's mode, the viewer's divider). */
export const compareMachine = (initial: CompareState) =>
  Machine.make({ state: CompareState, event: CompareEvent, initial })
    .on(ANY, CompareEvent.Choose, ({ state, event }) => entered(event.mode, state.split))
    .on(CompareState.Wipe, CompareEvent.Split, ({ event }) =>
      CompareState.Wipe({ split: Math.max(0, Math.min(1, event.split)) }),
    )
    .reenter(CompareState.Blink, CompareEvent.Flip, ({ state }) =>
      CompareState.Blink({ split: state.split, head: !state.head }),
    )
    .on(CompareState.Blink, CompareEvent.Hold, ({ state, event }) =>
      Match.value(event.on).pipe(
        Match.when(true, (): CompareState => CompareState.Held({ split: state.split })),
        Match.orElse((): CompareState => state),
      ),
    )
    .on(CompareState.Held, CompareEvent.Hold, ({ state, event }) =>
      Match.value(event.on).pipe(
        Match.when(false, (): CompareState =>
          CompareState.Blink({ split: state.split, head: false }),
        ),
        Match.orElse((): CompareState => state),
      ),
    )
    .timeout(CompareState.Blink, {
      duration: Duration.millis(BLINK_MS),
      event: CompareEvent.Flip,
    });

/** The compare's actor, started in `initial`. */
export const spawnCompare = (initial: CompareState) =>
  Machine.spawn(compareMachine(initial)).pipe(Effect.tap((actor) => actor.start));

export type CompareActor = Effect.Success<ReturnType<typeof spawnCompare>>;

/** The mode `state` shows: a held blink is still the blink. */
export const modeOf = (state: CompareState): CompareMode =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Off: (): CompareMode => 'off',
      Wipe: (): CompareMode => 'wipe',
      Blink: (): CompareMode => 'blink',
      Held: (): CompareMode => 'blink',
      Diff: (): CompareMode => 'diff',
    }),
  );

/** What the HEAD layer over the film shows: nothing (off), HEAD, or now (a blink's other side). */
export type HeadLayer = 'hidden' | 'head' | 'now';

/** The HEAD layer `state` shows: HEAD in a wipe (left of the divider), a diff, a held blink and on a blink's HEAD side. */
export const layerOf = (state: CompareState): HeadLayer =>
  Match.value(state).pipe(
    Match.tag('Off', (): HeadLayer => 'hidden'),
    Match.tag('Blink', (s): HeadLayer =>
      Match.value(s.head).pipe(
        Match.when(true, (): HeadLayer => 'head'),
        Match.orElse((): HeadLayer => 'now'),
      ),
    ),
    Match.tag('Wipe', 'Held', 'Diff', (): HeadLayer => 'head'),
    Match.exhaustive,
  );

/** How the HEAD layer meets the frame under it: the difference blend in a diff, plainly over otherwise. */
export const blendOf = (state: CompareState): 'difference' | 'normal' =>
  Match.value(state).pipe(
    Match.tag('Diff', () => 'difference' as const),
    Match.orElse(() => 'normal' as const),
  );

/** Where the wipe's divider sits, 0–1 across the frame: only in a wipe. */
export const splitOf = (state: CompareState): Option.Option<number> =>
  Match.value(state).pipe(
    Match.tag('Wipe', (s) => Option.some(s.split)),
    Match.orElse(() => Option.none()),
  );

/** What the viewer keeps of the compare through a reload: the divider. */
export const compareView = (state: CompareState): LabView['compare'] => ({ split: state.split });

/** The compare the link's `mode` and the viewer's kept divider start in (a blink on HEAD). */
export const compareAt = (mode: CompareMode, kept: LabView['compare']): CompareState =>
  entered(mode, kept.split);
