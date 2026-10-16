// The judge as Rive rigs (`judge-rig.ts`, in `figures.riv`), at the bench
// where the control draws its paper judge: his body behind the bench, and
// over it the paper he reads, the court's gavel lined in the props' ink and
// his circle hand on it. The look declares both rigs (`Look.rigs.judge`,
// `Look.rigs.hand`, `rigs.ts`).
//
// His acting, on the court's cues: reading the paper before him, eyes down,
// until he leans in on "the judge looks at you", his eyes coming up to the
// accused's face, his head held still (`follow` 0: the eyes do the looking);
// on the verdict his face softens (`face.ts`).

import { type Hex, at, ramp, rectShape, rounded } from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import type { PoseOf } from '@bible/film/rive';
import { ACCUSED, JUDGE } from '../../../righteousness-by-faith/court.ts';
import { C, piece } from '../../../righteousness-by-faith/kit.ts';
import { keyLight, ramps, shading } from '../../palette.ts';
import type { CourtFrame } from '../../scenes/court.ts';
import { BENCH, type Bench, type Props } from '../cutpaper/court.ts';
import { accusedHead } from './accused-rig.ts';
import { DIRECTION, type Direction, dressOf } from './direction.ts';
import { EASE, type Expression, acted } from './face.ts';
import { HAND_ART, JUDGE_KNOBS, JUDGE_TIMELINES, ROBE } from './judge-rig.ts';
import {
  FEATHER_REACH,
  HAND_LIFT,
  LIFT,
  type Pt,
  boilTime,
  castAlpha,
  castShows,
  inkCover,
  reachAbout,
} from './parts.ts';
import type { judgeProp } from './rigs.ts';

/** Reading: lids lowered on the page, the brows level and a little low. */
const READING: Expression = { ...EASE, eyes: JUDGE_KNOBS.eyes, browY: 1, browTilt: 0.02 };
/** He looks up at the accused: eyes open, the brows a little knit, grave. */
const REGARD: Expression = { ...EASE, eyes: 1.05, browY: 0.5, browTilt: -0.08 };
/** The verdict given: the brows' inner ends up, a small smile. Kind, not amused. */
const KIND: Expression = { ...EASE, eyes: 1, browY: -2.2, browTilt: 0.28, mouth: 1.6 };

/** Where his eyes go under `d`, from his head's centre: down on the papers, then the accused's head as `d` draws it. */
const gazeOf = (d: Direction) =>
  ({
    papers: [JUDGE_KNOBS.gazeX, JUDGE_KNOBS.gazeY],
    accused: [ACCUSED[0] - JUDGE[0], ACCUSED[1] + accusedHead(d).y - JUDGE[1]],
  }) as const;

/** How far he tips toward the accused as he leans in, radians about the robe's foot (negative: toward screen left). */
const LEAN = -0.06;

/** The view model's numbers on this frame (scratch). */
const NUMBERS: Record<keyof typeof JUDGE_KNOBS, number> = { ...JUDGE_KNOBS };

const poseOf = (
  f: CourtFrame,
  lean: number,
  gaze: ReturnType<typeof gazeOf>,
): PoseOf<ReturnType<typeof judgeProp>> => {
  acted(NUMBERS, READING, [
    [REGARD, lean],
    [KIND, f.at('stamp')],
  ]);
  NUMBERS.gazeX = lerp(gaze.papers[0], gaze.accused[0], lean);
  NUMBERS.gazeY = lerp(gaze.papers[1], gaze.accused[1], lean);
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

/** `pts` placed at `p` and turned by `p.rot`, in frame units. */
const placed = (
  pts: ReadonlyArray<Pt>,
  p: { readonly x: number; readonly y: number; readonly rot: number },
): Pt[] =>
  pts.map(([x, y]): Pt => [
    p.x + x * Math.cos(p.rot) - y * Math.sin(p.rot),
    p.y + x * Math.sin(p.rot) + y * Math.cos(p.rot),
  ]);

/** The paper he reads, in frame units. */
const sheetOutline: ReadonlyArray<Pt> = placed(READING_SHEET.shape, READING_SHEET);

/** The gavel turned `swing`, in frame units: its handle and its head. */
const gavelAt = (swing: number) => {
  const at = { x: GAVEL[0], y: GAVEL[1], rot: swing };
  return { handle: placed(GAVEL_HANDLE, at), head: placed(GAVEL_HEAD, at) };
};

/** His robe as he leans `lean` of the way in, in frame units: turned about its foot (the rig's lean, `LEAN`). */
const robeAt = (lean: number): Pt[] =>
  placed(ROBE.outline, { x: JUDGE[0], y: JUDGE[1] + 6 * lean + ROBE.pivot, rot: LEAN * lean });

/**
 * Where his hand's centre is, in frame units, as he leans `lean` of the way in
 * and the gavel turns `swing`: on the rim at rest, reaching round his
 * shoulder to the gavel's grip as he leans.
 */
export const handAt = (swing: number, lean: number): Pt => {
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
 * A feathered edge as the renderer draws one: a Gaussian falloff (σ half the
 * feather's strength) across 1.5 strengths each side of the edge, as stops
 * across that band (0 its inside, 1 its outside) and the share of the
 * shadow's alpha each keeps.
 */
const FEATHER = [
  [0, 0.9987],
  [1 / 6, 0.9772],
  [2 / 6, 0.8413],
  [3 / 6, 0.5],
  [4 / 6, 0.1587],
  [5 / 6, 0.0228],
  [1, 0],
] as const;

/** `hex` at opacity `a`, as a canvas colour. */
const withAlpha = (hex: Hex, a: number) =>
  `${hex}${Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, '0')}`;

/** The outline `pts` as the current path's next subpath. */
const trace = (ctx: CanvasRenderingContext2D, pts: ReadonlyArray<Pt>) => {
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
};

/** A surface under his hand: its name, its outline in frame units (none for the wall, which lies under all) and its paper. */
export interface UnderHand {
  readonly name: string;
  readonly outline: ReadonlyArray<Pt> | undefined;
  readonly paper: Hex;
}

/**
 * What lies under his hand as the court draws it, top first, in the bench's
 * units, each with its paper: the gavel's head and handle and the paper he
 * reads (`benchTop`), the gavel's block, the rim and the bench's face (the
 * court's `BENCH`), his robe as he leans, and past them all the court's
 * parchment wall. The one inventory of what his cast can fall on: the host
 * lays it from this, and the direction tests read it (`test/direction-host.ts`).
 */
export const underHand = (
  d: Direction,
  swing: number,
  lean: number,
  props: Props,
): ReadonlyArray<UnderHand> => {
  const gavel = gavelAt(swing);
  return [
    { name: 'gavel head', outline: gavel.head, paper: C.cutDeep },
    { name: 'gavel handle', outline: gavel.handle, paper: C.inkSoft },
    { name: 'reading sheet', outline: sheetOutline, paper: ramps.paper.base },
    { name: 'block', outline: BENCH.block, paper: props.block },
    { name: 'rim', outline: BENCH.rim, paper: props.rim },
    { name: 'bench', outline: BENCH.face, paper: props.bench },
    { name: 'robe', outline: robeAt(lean), paper: dressOf(d).robe.color },
    { name: 'wall', outline: undefined, paper: ramps.paper.base },
  ];
};

/**
 * His hand's cast, which the host lays because it falls on the host's
 * scenery (`handRig`): the hand's circle moved along the light by its lift
 * and feathered as the renderer feathers a figure's cast, laid on each
 * surface under it in that surface's shade (`ramp`), clipped to the surface
 * and kept off those above it. Only where it shows past the hand's ink under
 * `d` (`castShows`); under K1 the ink hides it whole.
 */
const handCast = (
  ctx: CanvasRenderingContext2D,
  d: Direction,
  swing: number,
  lean: number,
  props: Props,
) => {
  if (!castShows(HAND_LIFT, inkCover(d, 'small'))) return;
  const [x, y] = handAt(swing, lean);
  const [cx, cy] = [x + LIFT.x * HAND_LIFT, y + LIFT.y * HAND_LIFT];
  const band = FEATHER_REACH * LIFT.feather * HAND_LIFT;
  const [r0, r1] = [Math.max(0, HAND_ART.r - band), HAND_ART.r + band];
  const alpha = castAlpha(HAND_LIFT);
  const surfaces = underHand(d, swing, lean, props);
  surfaces.forEach(({ outline, paper }, i) => {
    ctx.save();
    if (outline !== undefined) {
      ctx.beginPath();
      trace(ctx, outline);
      ctx.clip();
    }
    for (const { outline: above } of surfaces.slice(0, i)) {
      if (above === undefined) continue;
      ctx.beginPath();
      ctx.rect(cx - r1 - 1, cy - r1 - 1, 2 * r1 + 2, 2 * r1 + 2);
      trace(ctx, above);
      ctx.clip('evenodd');
    }
    const shade = ramp(paper, keyLight, shading).shade;
    const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
    for (const [t, k] of FEATHER) g.addColorStop(t, withAlpha(shade, alpha * k));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r1, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  });
};

/**
 * The judge drawn by the rigs built from `d`: his body behind the bench (his
 * contact shadow is the bench's, the court's), the paper he reads and the
 * gavel on it, his hand's cast where it shows, and his hand on the gavel.
 */
export const judgeOf = (d: Direction): Bench => {
  const gaze = gazeOf(d);
  return {
    behind: (f, lean) =>
      at(f.ctx, { x: JUDGE[0], y: JUDGE[1] + 6 * lean }, () =>
        f.rive('judge', poseOf(f, lean, gaze)),
      ),
    over: (f, swing, lean, props) => {
      benchTop(f, swing, props);
      handCast(f.ctx, d, swing, lean, props);
      const [x, y] = handAt(swing, lean);
      at(f.ctx, { x, y }, () => f.rive('hand', { timelines: [['boil', boilTime(f.boil)]] }));
    },
  };
};

/** The judge `figures.riv` draws: built from `DIRECTION`. */
export const riveJudge: Bench = judgeOf(DIRECTION);
