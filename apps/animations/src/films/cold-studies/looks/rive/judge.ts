// The judge as Rive rigs (in `figures.riv`, `figures.ts`), at the bench
// where the control draws its paper judge: his body behind the bench, and
// over it the paper he reads, the court's gavel lined in the props' ink and
// his circle hand on it. The look declares both rigs (`Look.rigs.judge`,
// `Look.rigs.hand`, `rigs.ts`).
//
// His acting, on the court's cues: reading the paper before him, eyes down,
// until he leans in on "the judge looks at you", his eyes coming up to the
// accused's face, his head held still (`follow` 0: the eyes do the looking);
// on the verdict his face softens (`face.ts`).

import { at, rectShape, rounded } from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import type { PoseOf } from '@bible/film/rive';
import { ACCUSED, JUDGE } from '../../../righteousness-by-faith/court.ts';
import { C, piece } from '../../../righteousness-by-faith/kit.ts';
import { ramps } from '../../palette.ts';
import type { CourtFrame } from '../../scenes/court.ts';
import type { Bench, Props } from '../cutpaper/court.ts';
import { EASE, type Expression, acted } from './face.ts';
import { ACCUSED_HEAD, JUDGE_KNOBS, JUDGE_TIMELINES, boilTime } from './figures.ts';
import { type Pt, reachAbout } from './parts.ts';
import type { judgeProp } from './rigs.ts';

/** Reading: lids lowered on the page, the brows level and a little low. */
const READING: Expression = { ...EASE, eyes: JUDGE_KNOBS.eyes, browY: 1, browTilt: 0.02 };
/** He looks up at the accused: eyes open, the brows a little knit, grave. */
const REGARD: Expression = { ...EASE, eyes: 1.05, browY: 0.5, browTilt: -0.08 };
/** The verdict given: the brows' inner ends up, a small smile. Kind, not amused. */
const KIND: Expression = { ...EASE, eyes: 1, browY: -2.2, browTilt: 0.28, mouth: 1.6 };

/** Where his eyes go, from his head's centre: down on the papers, then the accused's head. */
const GAZE = {
  papers: [JUDGE_KNOBS.gazeX, JUDGE_KNOBS.gazeY],
  accused: [ACCUSED[0] - JUDGE[0], ACCUSED[1] + ACCUSED_HEAD - JUDGE[1]],
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

// The court's gavel (`righteousness-by-faith/court.ts`: `gavel`, which lines
// it in the kit's outline): the same paper and cut, lined in the props' ink.
const GAVEL_HANDLE = rounded(0, -52, 12, 100, 4);
const GAVEL_HEAD = rounded(0, -104, 64, 34, 8);

/**
 * The paper he reads: one sheet lying on the bench's rim before him, under
 * his lowered eyes, its top edge clear of his collar's bands (their feet at
 * y 453 with him upright; a lean lowers them behind the bench's rim, drawn
 * over him), so the two papers never read as one.
 */
const READING_SHEET = { x: 1186, y: 461, rot: -0.03, shape: rectShape(-48, -4, 96, 8) } as const;

/**
 * Where his hand's centre is, in frame units, as he leans `lean` of the way in
 * and the gavel turns `swing`: on the rim at rest, reaching round his
 * shoulder to the gavel's grip as he leans.
 */
const handAt = (swing: number, lean: number): Pt => {
  const shoulder: Pt = [JUDGE[0] + SHOULDER[0], JUDGE[1] + SHOULDER[1] + 10 * lean];
  const rest: Pt = [JUDGE[0] + REST[0], JUDGE[1] + REST[1]];
  const grip: Pt = [GAVEL[0] + Math.sin(swing) * GRIP, GAVEL[1] - Math.cos(swing) * GRIP];
  return reachAbout(shoulder, rest, grip, lean);
};

/** What lies on the bench before him: the paper he reads, and the gavel turned `swing`, lined in `props`' inks. */
const benchTop = (f: CourtFrame, swing: number, props: Props) => {
  const { ctx } = f;
  at(ctx, READING_SHEET, () =>
    piece(ctx, READING_SHEET.shape, ramps.paper.base, f.hand('judgeSheet'), {
      role: 'scenery',
      kind: 'cut',
      line: 2,
      outline: props.sheetInk,
    }),
  );
  at(ctx, { x: GAVEL[0], y: GAVEL[1], rot: swing }, () => {
    piece(ctx, GAVEL_HANDLE, C.inkSoft, f.hand('handle'), {
      role: 'figure',
      line: 2,
      outline: props.gavelInk,
    });
    piece(ctx, GAVEL_HEAD, C.cutDeep, f.hand('gavelHead'), {
      role: 'figure',
      line: 2.5,
      outline: props.gavelInk,
    });
  });
};

/**
 * The judge `figures.riv` draws: his body behind the bench (his contact
 * shadow is the bench's, the court's), the paper he reads and the gavel on
 * it, and his hand on the gavel. His hand casts no shadow: the file's ink
 * covers it whole.
 */
export const riveJudge: Bench = {
  behind: (f, lean) =>
    at(f.ctx, { x: JUDGE[0], y: JUDGE[1] + 6 * lean }, () => f.rive('judge', poseOf(f, lean))),
  over: (f, swing, lean, props) => {
    benchTop(f, swing, props);
    const [x, y] = handAt(swing, lean);
    at(f.ctx, { x, y }, () => f.rive('hand', { timelines: [['boil', boilTime(f.boil)]] }));
  },
};
