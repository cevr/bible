// The accused as a Rive rig (in `figures.riv`, `figures.ts`), posed from
// the court's cues and drawn by `f.rive` where the control draws its paper
// person: same place, same camera, same plane. The look declares the rig
// (`Look.rigs.accused`, `rigs.ts`); the film loads it before its first frame.
//
// The acting is the host's: the rig's timelines carry the body (the bow, the
// stamp's flinch, the lift), and the face moves through its beats here, each
// on the cue it reads (`face.ts`): worry as the evidence falls, shame on
// "you did it", fear as the judge leans in, astonishment on "righteous" (the
// verdict's stamp), then relief as the lift settles.

import { ground } from '@bible/film/canvas';
import { lerp } from '@bible/film/core';
import type { PoseOf } from '@bible/film/rive';
import { ACCUSED, JUDGE } from '../../../righteousness-by-faith/court.ts';
import type { CourtFrame } from '../../scenes/court.ts';
import { EASE, type Expression, acted } from './face.ts';
import { ACCUSED_KNOBS, ACCUSED_TIMELINES, type AccusedTimeline, boilTime } from './figures.ts';
import { smooth } from './parts.ts';
import type { accusedProp } from './rigs.ts';

/** The court's cues the rig's timelines play on. */
type Cue = 'bow' | 'stamp' | 'lift';

/**
 * Where `timeline` stands for cue `cue` at `f.t`: 0 before the cue; across
 * the cue its move (`ACCUSED_TIMELINES[…].move` authored seconds) stretched
 * to the cue's own length, so a lab edit to the cue's `dur` reshapes it;
 * after, the settle (overlap, the cloth's swing) in real seconds to the
 * timeline's end.
 */
const cueTime = (f: CourtFrame, cue: Cue, timeline: AccusedTimeline): number => {
  const { start, dur } = f.cue(cue);
  const since = f.t - start;
  if (since <= 0) return 0;
  const { seconds, move } = ACCUSED_TIMELINES[timeline];
  if (since < dur) return (since / dur) * move;
  return Math.min(seconds, move + since - dur);
};

/** How far the lift's settle has run once its cue is over, 0..1: the timeline's own length past the move. */
const settled = (f: CourtFrame) => {
  const { seconds, move } = ACCUSED_TIMELINES.lift;
  return Math.max(0, cueTime(f, 'lift', 'lift') - move) / (seconds - move);
};

// The face's beats, each a whole expression (`face.ts`; the kit's numbers, `parts.ts`).

/** The evidence falling: the inner brows up, the mouth's corners a little down. */
const WORRY: Expression = { ...EASE, browTilt: 0.26, browY: -1, mouth: -0.8 };
/** "You did it": brows low, lids heavy, the mouth turned down. */
const SHAME: Expression = { ...EASE, browY: 2.5, browTilt: 0.2, eyes: 0.55, mouth: -1.8 };
/** The judge leans in: brows up and their inner ends pulled up, eyes wide, the mouth tight and down. */
const FEAR: Expression = {
  ...EASE,
  browY: -2.5,
  browTilt: 0.36,
  eyes: 1.2,
  eyeW: 0.92,
  mouth: -1.4,
};
/** "Righteous": brows high and level (inside the head's outline), eyes round, the mouth an open "oh". */
const ASTONISHED: Expression = {
  ...EASE,
  browY: -2.5,
  browTilt: 0.04,
  eyes: 1.55,
  eyeW: 1.3,
  mouthLine: 0,
  mouthOpen: 1,
};
/** It is true: the brows ease down, the inner ends still a little up, a smile. */
const RELIEF: Expression = { ...EASE, browY: -1.5, browTilt: 0.2, eyes: 1.08, mouth: 2.6 };

/** Where the accused looks, in the figure's units from their feet: at us, at the evidence, down, at the judge. */
const GAZE = {
  rest: [ACCUSED_KNOBS.gazeX, ACCUSED_KNOBS.gazeY],
  evidence: [150, -60],
  down: [-60, 200],
  judge: [JUDGE[0] - ACCUSED[0], JUDGE[1] - ACCUSED[1]],
} as const;

/** The view model's numbers on this frame (scratch, so a frame allocates none). */
const NUMBERS: Record<keyof typeof ACCUSED_KNOBS, number> = { ...ACCUSED_KNOBS };

/** The pose on this frame: the rig's timelines at the cues' times, and the face's numbers. */
const poseOf = (f: CourtFrame): PoseOf<ReturnType<typeof accusedProp>> => {
  const drop = f.at('drop');
  const bow = f.at('bow');
  const lean = f.at('lean');
  const lift = f.at('lift');
  acted(NUMBERS, EASE, [
    [WORRY, drop],
    [SHAME, bow],
    [FEAR, lean],
    [ASTONISHED, f.at('stamp')],
    [RELIEF, smooth(0.1, 0.8, settled(f))],
  ]);
  // The eyes: on us, on the evidence as it falls, down on the bow, flicking
  // part way up to the judge as he leans in (they do not dare), then on him.
  const look = (axis: 0 | 1) => {
    const evidence = lerp(GAZE.rest[axis], GAZE.evidence[axis], drop);
    const down = lerp(evidence, GAZE.down[axis], bow);
    const dare = lerp(down, GAZE.judge[axis], 0.45 * lean);
    return lerp(dare, GAZE.judge[axis], lift);
  };
  NUMBERS.gazeX = look(0);
  NUMBERS.gazeY = look(1);
  NUMBERS.follow = 0.06 * lean * (1 - lift) + 0.08 * lift;
  return {
    timelines: [
      ['breath', f.t % ACCUSED_TIMELINES.breath.seconds],
      ['bow', cueTime(f, 'bow', 'bow')],
      ['stamp', cueTime(f, 'stamp', 'stamp')],
      ['lift', cueTime(f, 'lift', 'lift'), f.t > f.cue('lift').start ? 1 : 0],
      // The paper's crawl, on the film's own boil tick.
      ['boil', boilTime(f.boil)],
    ] as const,
    numbers: NUMBERS,
  };
};

/**
 * The accused drawn by the rig the look declares (`Look.rigs.accused`), feet
 * at the origin, over the kit's contact shadow (the host's, so both engines
 * cast the same one).
 */
export const riveAccused = (f: CourtFrame) => {
  ground(f.ctx, 0, 2, 100);
  f.rive('accused', poseOf(f));
};
