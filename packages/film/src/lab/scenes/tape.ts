// The Scenes tape's layout (design language §6): the whole film laid end to
// end as stills at a regular step, wrapped into rows like lines of text. A
// row is `perRow` stills long (12 on a laptop, a minute at 5 s a still; 6 on
// a phone, half a minute); each still shows the frame at the middle of its
// step. A scene's cut is a rule at its exact time inside its row, with the
// room to the next cut or the row's end (what its name may take); a band
// under the row says which scene each stretch is. Where a time sits on the
// tape and which time a point of a row is, both ways, so a press on a row
// and the playhead read one layout. Pure.

import { Array as Arr, Boolean as Bool, Option } from 'effect';
import { sceneAt } from '../../core/layout.ts';
import { justBefore } from '../../core/time.ts';

/** A scene as the tape lays it out: its id, and where it starts and how long it lasts, in film seconds. */
export interface TapeScene {
  readonly id: string;
  readonly start: number;
  readonly dur: number;
}

/** A still on the tape: the film second it shows, the step it stands for, and that second's scene. */
interface TapeStill {
  readonly t: number;
  readonly from: number;
  readonly scene: string;
}

/**
 * A scene's cut inside a row: at film second `at`, `x` of the way along it,
 * `room` to the next cut or the row's end, `before` back to the cut before
 * or the row's start; `last` when no cut follows it in the row.
 */
interface TapeCut {
  readonly scene: string;
  /** The scene's place in the film, from 0: its hue. */
  readonly index: number;
  readonly at: number;
  readonly x: number;
  readonly room: number;
  readonly before: number;
  readonly last: boolean;
}

/** Where a cut's name sits, and the most px it may take (shortened with an ellipsis past that). */
interface CutName {
  readonly side: 'after' | 'before' | 'none';
  readonly width: number;
}

/** How far a name starts from its rule (past the dot), and the gap it keeps short of the next rule. */
const NAME_INSET = 12;
const NAME_GAP = 4;
export const NO_CUT_NAME: CutName = { side: 'none', width: 0 };
/** A width in whole px, rounding a hair of float error up rather than losing a px to it. */
const wholePx = (px: number): number => Math.floor(px + 1e-6); // oxlint-disable-line film/one-clock-epsilon -- px, not a time

/** A stretch of a row in one scene, `x0` to `x1` of the way along it. */
interface TapeBand {
  readonly scene: string;
  readonly index: number;
  readonly x0: number;
  readonly x1: number;
}

/** One row of the tape: film seconds `from` to `from + span`, its stills, its cuts, its bands. */
export interface TapeRow {
  readonly index: number;
  readonly from: number;
  readonly stills: ReadonlyArray<TapeStill>;
  readonly cuts: ReadonlyArray<TapeCut>;
  readonly bands: ReadonlyArray<TapeBand>;
}

/** The tape: a still every `step` seconds, `perRow` a row, a row every `span` seconds. */
interface Tape {
  readonly step: number;
  readonly perRow: number;
  readonly span: number;
  readonly duration: number;
  readonly rows: ReadonlyArray<TapeRow>;
}

/** The tape's steps, finest first: what ⌘+ and ⌘− step between. */
export const STEPS = [2.5, 5, 10] as const;
type Step = (typeof STEPS)[number];

/** Stills a row: a laptop's 12, a phone's 6 (a window of the phone's width, `PHONE`). */
export const perRowAt = (phone: boolean): number =>
  Bool.match(phone, { onTrue: () => 6, onFalse: () => 12 });

/** The tape of `scenes`, `duration` seconds long, a still every `step` seconds and `perRow` a row. */
export const tapeOf = (
  scenes: ReadonlyArray<TapeScene>,
  duration: number,
  step: number,
  perRow: number,
): Tape => {
  const span = step * perRow;
  const count = Math.max(1, Math.ceil(duration / span));
  const index = new Map(scenes.map((s, i) => [s.id, i]));
  const indexOf = (id: string) => index.get(id) ?? 0;
  /** The fraction of a row starting at `from` that film second `t` sits at. */
  const along = (from: number, t: number) => Math.min(1, Math.max(0, (t - from) / span));
  const rows = Arr.makeBy(count, (r): TapeRow => {
    const from = r * span;
    const end = Math.min(from + span, duration);
    const stills = Arr.makeBy(Math.max(1, Math.ceil((end - from) / step)), (k): TapeStill => {
      const at = from + k * step;
      const t = Math.min(at + step / 2, Math.max(at, justBefore(duration)));
      return {
        t,
        from: at,
        scene: Option.getOrElse(
          Option.map(sceneAt(scenes, t), (s) => s.id),
          () => '',
        ),
      };
    });
    const inRow = scenes.filter((s) => s.start >= from && s.start < end);
    const cuts = inRow.map((s, k): TapeCut => {
      const x = along(from, s.start);
      const next = Option.match(Arr.get(inRow, k + 1), {
        onNone: () => 1,
        onSome: (n) => along(from, n.start),
      });
      const back = Option.match(Arr.get(inRow, k - 1), {
        onNone: () => x,
        onSome: (p) => x - along(from, p.start),
      });
      return {
        scene: s.id,
        index: indexOf(s.id),
        at: s.start,
        x,
        room: next - x,
        before: back,
        last: k === inRow.length - 1,
      };
    });
    const bands = scenes
      .filter((s) => s.start < end && s.start + s.dur > from)
      .map((s): TapeBand => ({
        scene: s.id,
        index: indexOf(s.id),
        x0: along(from, Math.max(s.start, from)),
        x1: along(from, Math.min(s.start + s.dur, end)),
      }));
    return { index: r, from, stills, cuts, bands };
  });
  return { step, perRow, span, duration, rows };
};

/**
 * The names of a row's `cuts` on a row `rowPx` wide, a letter `charPx`: each
 * after its rule, in the room to the next cut, whole where it fits and else
 * shortened to a letter and an ellipsis at least, or none. The row's last
 * cut, without room for its whole name after its rule, sits it before the
 * rule instead where the stretch back to the cut before is free of that
 * cut's name and dot. No two names meet and none runs off the row.
 */
export const cutNames = (
  cuts: ReadonlyArray<TapeCut>,
  rowPx: number,
  charPx: number,
): ReadonlyArray<CutName> => {
  const least = 2 * charPx;
  const named: Array<CutName> = [];
  cuts.forEach((cut, k) => {
    const whole = cut.scene.length * charPx;
    const after = wholePx(cut.room * rowPx - NAME_INSET - NAME_GAP);
    /** What the cut before takes past its own rule: its name's start and length where that name follows it, else its dot. */
    const taken = Option.match(Arr.get(named, k - 1), {
      onNone: () => 0,
      onSome: (n) =>
        Bool.match(n.side === 'after', {
          onTrue: () => NAME_INSET + Math.min(n.width, (cuts[k - 1]?.scene.length ?? 0) * charPx),
          onFalse: () => NAME_INSET,
        }),
    });
    const free = wholePx(cut.before * rowPx - taken - NAME_GAP - NAME_INSET);
    const name = Option.getOrElse(
      Option.firstSomeOf([
        Option.liftPredicate({ side: 'after', width: after } as const, () => after >= whole),
        Option.liftPredicate(
          { side: 'before', width: free } as const,
          () => cut.last && free >= whole,
        ),
        Option.liftPredicate({ side: 'after', width: after } as const, () => after >= least),
      ]),
      () => NO_CUT_NAME,
    );
    named.push(name);
  });
  return named;
};

/** The row film second `t` sits in. */
export const rowAt = (tape: Tape, t: number): number =>
  Math.min(tape.rows.length - 1, Math.max(0, Math.floor(t / tape.span)));

/** Where film second `t` sits on the tape: its row, and how far along it. */
export const placeOf = (tape: Tape, t: number) => {
  const row = rowAt(tape, t);
  return { row, x: Math.min(1, Math.max(0, (t - row * tape.span) / tape.span)) };
};

/** The film second at `x` of the way along row `row`: never past the film's end. */
export const timeAt = (tape: Tape, row: number, x: number): number =>
  Math.min(
    Math.max(0, justBefore(tape.duration)),
    Math.max(0, row * tape.span + Math.min(1, Math.max(0, x)) * tape.span),
  );

/** The next step out (`coarser`) or in from `step`, staying at the ends. */
export const stepFrom = (step: number, coarser: boolean): Step => {
  const at = Math.max(
    0,
    STEPS.findIndex((s) => s === step),
  );
  const next = Bool.match(coarser, {
    onTrue: () => Math.min(STEPS.length - 1, at + 1),
    onFalse: () => Math.max(0, at - 1),
  });
  return STEPS[next] ?? 5;
};
