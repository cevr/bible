// The judge as Rive rigs (`judge-rig.ts`, in `figures.riv`), at the bench
// where the control draws its paper judge: his body behind the bench, and
// his circle hand over it on the court's own gavel. The look declares both
// rigs (`Look.rigs.judge`, `Look.rigs.hand`, `rigs.ts`).
//
// His acting, on the court's cues: reading the papers before him, eyes down,
// until he leans in on "the judge looks at you", his eyes coming up to the
// accused and his head turning a little after them; on the verdict his face
// softens (`face.ts`).

import { at } from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import type { PoseOf } from '@bible/film/rive';
import { ACCUSED, JUDGE, gavel } from '../../../righteousness-by-faith/court.ts';
import type { CourtFrame } from '../../scenes/court.ts';
import type { Bench } from '../cutpaper/court.ts';
import { EASE, type Expression, acted } from './face.ts';
import { JUDGE_KNOBS, JUDGE_TIMELINES } from './judge-rig.ts';
import { type Pt, boilTime, reachAbout } from './parts.ts';
import type { judgeProp } from './rigs.ts';

/** Reading: lids lowered on the page, the brows level and a little low. */
const READING: Expression = { ...EASE, eyes: JUDGE_KNOBS.eyes, browY: 1, browTilt: 0.02 };
/** He looks up at the accused: eyes open, the brows a little knit, grave. */
const REGARD: Expression = { ...EASE, eyes: 1.05, browY: 0.5, browTilt: -0.08 };
/** The verdict given: the brows' inner ends up, a small smile. Kind, not amused. */
const KIND: Expression = { ...EASE, eyes: 1, browY: -2.2, browTilt: 0.28, mouth: 1.6 };

/** Where his eyes go, from his head's centre: down on the papers, then the accused's face. */
const GAZE = {
  papers: [JUDGE_KNOBS.gazeX, JUDGE_KNOBS.gazeY],
  accused: [ACCUSED[0] - JUDGE[0], ACCUSED[1] - 150 - JUDGE[1]],
} as const;

/** How far he tips toward the accused as he leans in, radians about the robe's foot (negative: toward screen left). */
const LEAN = -0.06;

/** The view model's numbers on this frame (scratch). */
const NUMBERS: Record<keyof typeof JUDGE_KNOBS, number> = { ...JUDGE_KNOBS };

const poseOf = (f: CourtFrame, lean: number): PoseOf<ReturnType<typeof judgeProp>> => {
  acted(NUMBERS, READING, [
    [REGARD, lean],
    [KIND, f.at('stamp')],
  ]);
  NUMBERS.gazeX = lerp(GAZE.papers[0], GAZE.accused[0], lean);
  NUMBERS.gazeY = lerp(GAZE.papers[1], GAZE.accused[1], lean);
  NUMBERS.follow = 0;
  NUMBERS.lean = LEAN * lean;
  return {
    timelines: [
      ['breath', f.t % JUDGE_TIMELINES.breath.seconds],
      ['boil', boilTime(f.boil)],
    ] as const,
    numbers: NUMBERS,
  };
};

// His hand's reach, from his head's centre, as the court's `judgeGavel` sets it
// (`righteousness-by-faith/court.ts`: `JUDGE_SHOULDER`, `JUDGE_REST`, `GAVEL`,
// `GAVEL_GRIP`, not exported there).
/** His near shoulder, inside the robe's top. */
const SHOULDER: Pt = [74, 70];
/** Where the hand rests: on the bench's rim, short of the gavel. */
const REST: Pt = [92, 104];
/** The gavel's foot on the bench, in frame units, and how far up the handle the hand closes. */
const GAVEL: Pt = [1330, 445];
const GRIP = 16;

/**
 * The judge drawn by the rigs the look declares: his body behind the bench
 * (his contact shadow is the bench's, the court's), his hand on the gavel
 * over it.
 */
export const riveJudge: Bench = {
  behind: (f, lean) =>
    at(f.ctx, { x: JUDGE[0], y: JUDGE[1] + 6 * lean }, () => f.rive('judge', poseOf(f, lean))),
  over: (f, swing, lean) => {
    gavel(f.ctx, f.hand, { x: GAVEL[0], y: GAVEL[1], rot: swing });
    const shoulder: Pt = [JUDGE[0] + SHOULDER[0], JUDGE[1] + SHOULDER[1] + 10 * lean];
    const rest: Pt = [JUDGE[0] + REST[0], JUDGE[1] + REST[1]];
    const grip: Pt = [GAVEL[0] + Math.sin(swing) * GRIP, GAVEL[1] - Math.cos(swing) * GRIP];
    const [x, y] = reachAbout(shoulder, rest, grip, lean);
    at(f.ctx, { x, y }, () => f.rive('hand', { timelines: [['boil', boilTime(f.boil)]] }));
  },
};
