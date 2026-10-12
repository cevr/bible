// `skinned`: the control (`cutpaper`) with its accused bent by bones for
// paper (`skeleton`, @bible/film/canvas) instead of turned as rigid pieces,
// everything else the control's own: our engine's answer to the Rive rig's
// skinned torso and head (bones, 2026-10-12).

import { LIGHT } from '../../../righteousness-by-faith/light.ts';
import type { Look } from '../../look.ts';
import { courtWith } from '../cutpaper/court.ts';
import { card, job } from '../cutpaper/job.ts';
import { skinnedAccused } from './accused.ts';

export const skinned: Look = { court: courtWith(skinnedAccused), job, card, light: LIGHT.room };
