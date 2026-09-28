// The compare with HEAD, as one machine: off, wipe (HEAD left of a divider
// the pointer drags, clamped to the frame) or blink (HEAD and now flip every
// BLINK_MS, starting on HEAD: a state timeout, re-entered on each flip, so
// the timer is the actor's and stops with the state). The divider keeps its
// place across modes; the view keeps mode and place through a reload.
//
//   Off | Wipe | Blink ─Choose→ Off | Wipe | Blink
//   Wipe ─Split→ Wipe        Blink ─Flip (every BLINK_MS)→ Blink

import { Duration, Effect, Match, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import type { LabView } from '../../player/view-state.ts';

/** How long each side of a blink shows. */
export const BLINK_MS = 450;

export const CompareMode = Schema.Literals(['off', 'wipe', 'blink']);
export type CompareMode = typeof CompareMode.Type;

export const CompareState = State({
  Off: { split: Schema.Finite },
  /** HEAD left of the divider at `split` (0–1 across the frame), now right of it. */
  Wipe: { split: Schema.Finite },
  /** HEAD shows while `head`, now otherwise. */
  Blink: { split: Schema.Finite, head: Schema.Boolean },
});
export type CompareState = typeof CompareState.Type;

export const CompareEvent = Event({
  Choose: { mode: CompareMode },
  /** The divider dragged to `split`, 0–1 across the frame. */
  Split: { split: Schema.Finite },
  Flip: {},
});
export type CompareEvent = typeof CompareEvent.Type;

const ANY = [CompareState.Off, CompareState.Wipe, CompareState.Blink] as const;

/** The state `mode` shows, the divider at `split`. */
const entered = (mode: CompareMode, split: number): CompareState =>
  Match.value(mode).pipe(
    Match.when('off', () => CompareState.Off({ split })),
    Match.when('wipe', () => CompareState.Wipe({ split })),
    Match.orElse(() => CompareState.Blink({ split, head: true })),
  );

/** The compare machine, starting in `initial` (the view's, after a reload). */
export const compareMachine = (initial: CompareState) =>
  Machine.make({ state: CompareState, event: CompareEvent, initial })
    .on(ANY, CompareEvent.Choose, ({ state, event }) => entered(event.mode, state.split))
    .on(CompareState.Wipe, CompareEvent.Split, ({ event }) =>
      CompareState.Wipe({ split: Math.max(0, Math.min(1, event.split)) }),
    )
    .reenter(CompareState.Blink, CompareEvent.Flip, ({ state }) =>
      CompareState.Blink({ split: state.split, head: !state.head }),
    )
    .timeout(CompareState.Blink, {
      duration: Duration.millis(BLINK_MS),
      event: CompareEvent.Flip,
    });

/** The compare's actor, started in `initial`. */
export const spawnCompare = (initial: CompareState) =>
  Machine.spawn(compareMachine(initial)).pipe(Effect.tap((actor) => actor.start));

export type CompareActor = Effect.Success<ReturnType<typeof spawnCompare>>;

/** The mode `state` shows. */
export const modeOf = (state: CompareState): CompareMode =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Off: (): CompareMode => 'off',
      Wipe: (): CompareMode => 'wipe',
      Blink: (): CompareMode => 'blink',
    }),
  );

/** The compare as the view keeps it through a reload. */
export const compareView = (state: CompareState): LabView['compare'] => ({
  mode: modeOf(state),
  split: state.split,
});

/** The compare the view kept, as the machine starts in it (a blink on HEAD). */
export const compareFromView = (kept: LabView['compare']): CompareState =>
  entered(kept.mode, kept.split);
