// A scene is drawn once, on a clock of its own (its `main` timeline), and the
// voice decides when each drawn moment plays. Every `{mark}` in a beat's
// narration is an Event of the same name on that timeline; the film plays the
// scene through a piecewise-linear warp that lands each Event on the word it
// marks. Between two marks the timeline runs at an even speed. Right after
// each, it runs at its drawn speed for a moment (the attack), so the motion a
// word sets off keeps the pace it was drawn at. A new take moves the pins and
// never the drawing. Pure.

import { Array as Arr, Option, Order } from 'effect';
import type { Placed } from './layout.ts';
import type { SceneBoard } from './rive.ts';

/** A pin of the warp: scene seconds (the voice's clock) against timeline seconds (the drawing's). */
export type Knot = readonly [real: number, drawn: number];

/** How long after a pin the timeline plays at its drawn speed, at most. */
export const ATTACK = 0.6;

/** Shorter than this, an attack is not worth a knot: a frame at 60 fps. */
const MIN_ATTACK = 1 / 60;

/**
 * The warp through `pins` (strictly increasing in both coordinates): each pin,
 * and after it an attack knot where the timeline has run at its own speed for
 * up to `ATTACK` seconds, never more than half of the way to the next pin on
 * either clock.
 */
export const warpKnots = (pins: ReadonlyArray<Knot>): ReadonlyArray<Knot> =>
  pins.flatMap((pin, i): ReadonlyArray<Knot> => {
    const next = Arr.get(pins, i + 1);
    if (Option.isNone(next)) return [pin];
    const [real, drawn] = pin;
    const attack = Math.min(ATTACK, 0.5 * (next.value[0] - real), 0.5 * (next.value[1] - drawn));
    if (attack <= MIN_ATTACK) return [pin];
    return [pin, [real + attack, drawn + attack]];
  });

/**
 * The second coordinate at `x` on the first, along the line through `knots`
 * (ascending on both), held flat past either end; with no knots, `x` itself.
 */
const along = (knots: ReadonlyArray<Knot>, x: number): number => {
  const after = knots.findIndex(([at]) => at > x);
  if (after < 0) return Option.match(Arr.last(knots), { onNone: () => x, onSome: (k) => k[1] });
  const b = Arr.getUnsafe(knots, after);
  if (after === 0) return b[1];
  const a = Arr.getUnsafe(knots, after - 1);
  return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
};

/** The timeline's time at scene time `real`. */
export const drawnAt = (knots: ReadonlyArray<Knot>, real: number): number => along(knots, real);

/** The scene time at which the timeline reaches `drawn`: the warp run backwards. */
export const realAt = (knots: ReadonlyArray<Knot>, drawn: number): number =>
  along(
    knots.map(([r, d]): Knot => [d, r]),
    drawn,
  );

/** A mark and its Event: when it is spoken (scene seconds) and when it is drawn (timeline seconds). */
export interface Pin {
  readonly mark: string;
  readonly real: number;
  readonly drawn: number;
}

/** How a scene's marks meet its timeline, and the warp that follows from them. */
export interface ScenePins {
  readonly scene: string;
  /** Marks whose Event is on the timeline, in the order they are spoken. */
  readonly pinned: ReadonlyArray<Pin>;
  /** Marks with no Event of their name on the timeline. */
  readonly unpinned: ReadonlyArray<string>;
  /**
   * Marks whose Event comes before an earlier mark's, or at the timeline's
   * end: the warp cannot pass through them, so it leaves them out.
   */
  readonly disordered: ReadonlyArray<string>;
  /** The warp: none for a scene with no timeline, which shows its first frame throughout. */
  readonly knots: ReadonlyArray<Knot>;
}

/**
 * Pair a placed scene's marks with its board's Events and build its warp:
 * from the scene's start to its end, through each mark in spoken order. An
 * Event keyed more than once pins at its first key.
 */
export const scenePins = (placed: Placed, board: SceneBoard): ScenePins => {
  const scene = placed.spec.id;
  const first = new Map<string, number>();
  for (const event of board.events) if (!first.has(event.name)) first.set(event.name, event.at);
  const spoken = Arr.sort(
    [...placed.voice.marks].map(([mark, at]) => ({ mark, real: placed.speechStart + at })),
    Order.mapInput(Order.Number, (m: { readonly real: number }) => m.real),
  );
  const unpinned = spoken.filter((m) => !first.has(m.mark)).map((m) => m.mark);
  if (Option.isNone(board.main)) return { scene, pinned: [], unpinned, disordered: [], knots: [] };
  const end: Knot = [placed.dur, board.main.value.seconds];
  const pinned: Array<Pin> = [];
  const disordered: Array<string> = [];
  let last: Knot = [0, 0];
  for (const { mark, real } of spoken) {
    const event = Option.fromNullishOr(first.get(mark));
    if (Option.isNone(event)) continue;
    const drawn = event.value;
    // Two marks on one word drawn at one moment are one pin; so is a mark on
    // the first word of a scene with no lead, drawn at its first frame.
    if (real === last[0] && drawn === last[1]) {
      pinned.push({ mark, real, drawn });
      continue;
    }
    const ahead = real > last[0] && drawn > last[1];
    const before = real < end[0] && drawn < end[1];
    if (!ahead || !before) {
      disordered.push(mark);
      continue;
    }
    pinned.push({ mark, real, drawn });
    last = [real, drawn];
  }
  const origin: Knot = [0, 0];
  const pins = Arr.dedupeWith(
    [origin, ...pinned.map((p): Knot => [p.real, p.drawn]), end],
    (a, b) => a[0] === b[0] && a[1] === b[1],
  );
  return { scene, pinned, unpinned, disordered, knots: warpKnots(pins) };
};
