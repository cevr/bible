// Where a point knob's handle sits on the frame, from the knob reads the frame
// recorded: pure, so the handles and their tests share it. A read's transform
// is the one it was read under, or, when it was read before the camera that
// draws it (a camera's target, a pole the shot pushes in on), the transform
// inside that camera (`framed`): that is where the knob's value lands on the
// frame. A knob gets a handle only when every read this frame went straight
// onto the frame (not into a transition's layer) under one invertible
// transform; otherwise the reason, and numbers only.

import { Array as Arr, Option, Schema } from 'effect';
import type { KnobRead } from '../../canvas/film.ts';
import { type Affine, applyAffine, invertAffine, sameAffine } from '../../core/affine.ts';
import { type Knobs, Point } from '../../core/schema.ts';

const isPoint = Schema.is(Point);

/** A point knob's handle: its value, where it sits on the frame, and the transform both ways. */
export interface Handle {
  readonly _tag: 'Handle';
  readonly value: Point;
  readonly at: Point;
  /** Where it sits under the framing as authored, before the scene's drift. */
  readonly aimedAt: Point;
  readonly m: Affine;
  readonly inv: Affine;
}

/** Why a knob has no handle on this frame. */
export interface NoHandle {
  readonly _tag: 'NoHandle';
  readonly why: string;
}

export type HandleAt = Handle | NoHandle;

const none = (why: string): HandleAt => ({ _tag: 'NoHandle', why });

/** The transform a read's value lands on the frame through: its camera's, else its own. */
const landsThrough = (r: KnobRead): Option.Option<Affine> =>
  Option.orElse(Option.fromUndefinedOr(r.framed), () => Option.fromUndefinedOr(r.transform));

/** Where knob `name` of `scene` sits on the frame `reads` were recorded from, or why it does not. */
export const handleOf = (reads: ReadonlyArray<KnobRead>, scene: string, name: string): HandleAt => {
  const mine = reads.filter((r) => r.scene === scene && r.name === name);
  return Option.match(Arr.head(mine), {
    onNone: () => none('not read at this frame: numbers only'),
    onSome: (first) => {
      const value = first.value;
      if (!isPoint(value)) return none('a number');
      const all = Option.all(mine.map(landsThrough));
      const own = landsThrough(first);
      if (Option.isNone(all) || Option.isNone(own))
        return none('read inside a transition here: numbers only');
      const m = own.value;
      if (!all.value.every((n) => sameAffine(n, m)))
        return none('read under more than one transform here: numbers only');
      return Option.match(invertAffine(m), {
        onNone: () => none('drawn squashed flat here: numbers only'),
        onSome: (inv): HandleAt => ({
          _tag: 'Handle',
          value,
          at: applyAffine(m, value),
          aimedAt: applyAffine(first.aimed ?? m, value),
          m,
          inv,
        }),
      });
    },
  });
};

/** The point knobs of `scene` with a handle on the frame `reads` were recorded from. */
export const handlesOf = (
  reads: ReadonlyArray<KnobRead>,
  scene: string,
): ReadonlyArray<Handle & { readonly name: string }> =>
  Arr.dedupe(reads.filter((r) => r.scene === scene).map((r) => r.name)).flatMap((name) => {
    const at = handleOf(reads, scene, name);
    if (at._tag === 'NoHandle') return [];
    return [{ ...at, name }];
  });

/**
 * Whether knob `name` is a camera's target: a point knob with a
 * `<name>Zoom` knob beside it (`knobCamera(point, zoom, rot?)`). The camera
 * keeps its target at the frame's centre, so the handle there is a reticle.
 */
export const isCameraTarget = (knobs: Knobs, name: string): boolean =>
  Option.exists(Option.fromUndefinedOr(knobs[name]), isPoint) && `${name}Zoom` in knobs;

/** How near (film pixels) a camera's target must sit to the frame's centre to be the one it sits on. */
const CENTRED_PX = 1;

/**
 * How a press on `handle` drags knob `name`: a camera's target the camera
 * sits on (at the centre of a frame `size` film pixels) cannot leave the
 * centre, so its drag moves the picture; anything else follows the pointer.
 */
export const knobMode = (
  knobs: Knobs,
  name: string,
  handle: Handle,
  size: readonly [number, number],
): 'point' | 'picture' => {
  // Centred as authored: the scene's drift carries the target a little off
  // the centre mid-scene, but the camera still sits on it.
  const centred =
    Math.abs(handle.aimedAt[0] - size[0] / 2) <= CENTRED_PX &&
    Math.abs(handle.aimedAt[1] - size[1] / 2) <= CENTRED_PX;
  if (centred && isCameraTarget(knobs, name)) return 'picture';
  return 'point';
};
