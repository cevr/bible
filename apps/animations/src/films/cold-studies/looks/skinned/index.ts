// `skinned`: the control (`cutpaper`) with its accused bent by bones for
// paper (`skeleton`, @bible/film/canvas) instead of turned as rigid pieces,
// everything else the control's own: our engine's answer to the Rive rig's
// skinned torso and head (bones, 2026-10-12). `skinned` poses it with the
// rig's values; `amplified` takes the same moves further, to read at film
// scale.

import { LIGHT } from '../../../righteousness-by-faith/light.ts';
import type { Look } from '../../look.ts';
import { courtWith } from '../cutpaper/court.ts';
import { card, job } from '../cutpaper/job.ts';
import { AMPLIFIED, PARITY, skinnedAccused } from './accused.ts';

export const skinned: Look = {
  court: courtWith(skinnedAccused(PARITY)),
  job,
  card,
  light: LIGHT.room,
};

export const amplified: Look = {
  court: courtWith(skinnedAccused(AMPLIFIED)),
  job,
  card,
  light: LIGHT.room,
};
