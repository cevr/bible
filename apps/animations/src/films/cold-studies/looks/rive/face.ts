// A face's acting, host side: an expression is the face kit's numbers
// (`FACE`, `parts.ts`) without the gaze, and a beat moves the face from the
// one it wears toward the next by the beat's cue. Every figure built on the
// kit acts with the same numbers, so one expression reads the same on every
// face. Pure.

import { lerp } from '@bible/film/core';
import { type FaceKnob, smooth } from './parts.ts';

/** What a face shows: brow, eyes and mouth (the kit's numbers less the gaze and the head's follow). */
export type Expression = Readonly<Record<Exclude<FaceKnob, 'gazeX' | 'gazeY' | 'follow'>, number>>;

/** The face at ease: the brows' inner ends a little up (level brows read stern), eyes open, mouth closed and level. */
export const EASE: Expression = {
  browY: 0,
  browTilt: 0.12,
  eyes: 1,
  eyeW: 1,
  mouth: 0,
  mouthLine: 1,
  mouthOpen: 0,
};

const KEYS = [
  'browY',
  'browTilt',
  'eyes',
  'eyeW',
  'mouth',
  'mouthLine',
  'mouthOpen',
] as const satisfies ReadonlyArray<keyof Expression>;

/** `out` moved `k` (0..1) of the way toward `to`. */
const toward = (out: Record<keyof Expression, number>, to: Expression, k: number) => {
  for (const key of KEYS) out[key] = lerp(out[key], to[key], Math.max(0, Math.min(1, k)));
};

/** A beat of acting: the expression it ends on, and how far into it the frame is. */
export type Beat = readonly [Expression, number];

/**
 * The face after `beats`, in order, each moving it from where the last left
 * it; into `out` (scratch). The mouth is one mark at a time: its line gives
 * way while the "oh" is open and comes back only as the "oh" closes, so a
 * change between them never shows both half drawn.
 */
export const acted = (
  out: Record<keyof Expression, number>,
  from: Expression,
  beats: ReadonlyArray<Beat>,
) => {
  Object.assign(out, from);
  for (const [to, k] of beats) toward(out, to, k);
  out.mouthLine = Math.min(out.mouthLine, 1 - smooth(0.05, 0.3, out.mouthOpen));
  return out;
};
