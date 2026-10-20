// A scene's rows as the studio's code view reads them, and each row's state
// at a scene time, pure: what plays when, with no frame drawn. A scene in the
// draw form gives a row per cue of its timeline, which times it, from the
// layout's resolved cues (`stepRowsOf`). Each row is waiting before its
// start, live up to its end with how far through, held after it, and
// released once it is wholly taken back (`gone`); a cue is never taken back,
// so it is held to the scene's end. The view joins each row to where its
// scene's file writes it (`SceneCode`) and lights that span by the row's
// state, and its band names how many rows are live and the next to start, in
// the row's words. A state is arithmetic on the time, so the view runs no
// scene to know it, and a link with `#t=` lights what its sender saw.

import { Array as Arr, Data, Option, Order } from 'effect';
import type { Placed } from './layout.ts';
import { liveEnd } from './timeline.ts';

/** One row of a scene: what plays, the cue that times it, and when, in scene seconds. */
export interface StepRow {
  /** Its place in the scene's rows, from 0. */
  readonly index: number;
  /** The cue that times it, and which the view joins it to: a cue row's own name. */
  readonly cue: string;
  /** What a reader reads of it: a cue row's name. */
  readonly words: string;
  readonly start: number;
  /** Where it stops playing: a cue of no length plays on its one frame (`liveEnd`). */
  readonly end: number;
  /** When it is wholly taken back, else the scene's end. */
  readonly gone: number;
}

/** A row's state at a scene time. */
export type StepState = Data.TaggedEnum<{
  /** Before its start: `in` seconds to it. */
  Waits: { readonly in: number };
  /** From its start up to its end: `progress` of its span played, 0 to 1. */
  Live: { readonly progress: number };
  /** Played whole, and not taken back. */
  Held: {};
  /** Wholly taken back. */
  Released: {};
}>;
export const StepState = Data.taggedEnum<StepState>();

/**
 * The rows of scene `placed` in a film at `fps`: one per cue of its
 * timeline, in the timeline's order, each held to the scene's end.
 */
export const stepRowsOf = (
  placed: Pick<Placed, 'cues' | 'dur'>,
  fps: number,
): ReadonlyArray<StepRow> =>
  [...placed.cues].map(([name, cue], index) => ({
    index,
    cue: name,
    words: name,
    start: cue.start,
    end: liveEnd(cue, fps),
    gone: placed.dur,
  }));

/** `row`'s state at scene time `t`. */
const stateAt = (row: StepRow, t: number): StepState => {
  if (t < row.start) return StepState.Waits({ in: row.start - t });
  if (t < row.end) return StepState.Live({ progress: (t - row.start) / (row.end - row.start) });
  if (t < row.gone) return StepState.Held();
  return StepState.Released();
};

/** Each of `rows`' states at scene time `t`, in their order. */
export const stepStateAt = (rows: ReadonlyArray<StepRow>, t: number): ReadonlyArray<StepState> =>
  rows.map((row) => stateAt(row, t));

/** The next row to start after scene time `t`, and how long until it does. */
interface NextStep {
  readonly row: StepRow;
  readonly in: number;
}

/** Of two rows, the one to start first; of two that start together, the one first in the scene. */
const FIRST = Order.combine(
  Order.mapInput(Order.Number, (r: StepRow) => r.start),
  Order.mapInput(Order.Number, (r: StepRow) => r.index),
);

/** The row that waits the least at scene time `t` (`FIRST` of those whose start is after it); none once every row has begun. */
export const nextStep = (rows: ReadonlyArray<StepRow>, t: number): Option.Option<NextStep> =>
  Option.map(
    Arr.head(
      Arr.sort(
        rows.filter((r) => r.start > t),
        FIRST,
      ),
    ),
    (row) => ({ row, in: row.start - t }),
  );
