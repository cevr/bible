// `rive` and `rivegl`: the control (`cutpaper`) with its accused drawn by a
// Rive rig instead of the kit's paper person, everything else the control's
// own: the head-to-head of the two engines on one figure (rive-spike,
// 2026-10-11). `rive` draws the rig with Rive's Canvas 2D renderer on our
// context; `rivegl` with the Rive Renderer on WebGL 2, composited in.

import { LIGHT } from '../../../righteousness-by-faith/light.ts';
import type { Look } from '../../look.ts';
import { courtWith } from '../cutpaper/court.ts';
import { card, job } from '../cutpaper/job.ts';
import { accusedProp, riveAccused } from './accused.ts';

export const rive: Look = {
  court: courtWith(riveAccused),
  rigs: { accused: accusedProp('canvas') },
  job,
  card,
  light: LIGHT.room,
};
export const rivegl: Look = {
  court: courtWith(riveAccused),
  rigs: { accused: accusedProp('webgl2') },
  job,
  card,
  light: LIGHT.room,
};
