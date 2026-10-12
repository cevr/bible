// The accused as a Rive rig (`rig.ts`, built to `accused.riv` by `build.ts`),
// posed from the court's cues and drawn by `f.rive` where the control draws
// its paper person: same place, same camera, same plane. The film loads it
// with its other rigs before the first frame, in a page and in Bun alike.

import type { RiveEngine, RivePropSpec } from '@bible/film/rive';
import { lerp } from '@bible/film/core';
import { ACCUSED, JUDGE } from '../../../righteousness-by-faith/court.ts';
import type { CourtFrame } from '../../scenes/court.ts';
import accusedRiv from './accused.riv' with { type: 'file' };
import { ART, KNOBS, type Knob, TIMELINES, type Timeline } from './rig.ts';

const SOURCE = {
  riv: accusedRiv,
  artboard: 'Accused',
  timelines: Object.keys(TIMELINES),
  fresh: 'fresh',
  stateMachine: 'Knobs',
  refresh: ['head'],
} as const;

/** The prop for each engine: feet at our origin, its face for `check`. */
export const accusedProp = (engine: RiveEngine): RivePropSpec => ({
  source: SOURCE,
  engine,
  key: `cold-studies/accused/${engine}`,
  origin: ART.feet,
  face: { node: 'face', height: 76 },
});

/** The court's cues the rig's timelines play on. */
type Cue = 'bow' | 'stamp' | 'lift';

/**
 * Where `timeline` stands for cue `cue` at `f.t`: 0 before the cue; across
 * the cue its move (`TIMELINES[…].move` authored seconds) stretched to the
 * cue's own length, so a lab edit to the cue's `dur` reshapes it; after, the
 * settle (overlap, the cloth's swing) in real seconds to the timeline's end.
 */
const cueTime = (f: CourtFrame, cue: Cue, timeline: Timeline): number => {
  const { start, dur } = f.cue(cue);
  const since = f.t - start;
  if (since <= 0) return 0;
  const { seconds, move } = TIMELINES[timeline];
  if (since < dur) return (since / dur) * move;
  return Math.min(seconds, move + since - dur);
};

/** The judge, from where the accused stands, in the figure's units. */
const AT_JUDGE = [JUDGE[0] - ACCUSED[0], JUDGE[1] - ACCUSED[1]] as const;

/** The view model's numbers on this frame (scratch, so a frame allocates none). */
const NUMBERS: Record<Knob, number> = { ...KNOBS };

/**
 * The pose: the control's acting (head down on "you did it", eyes down and
 * left, up at the verdict) as the rig plays it, and, once up, the eyes on
 * the judge with the head turning a little after them (the look-at).
 */
const poseOf = (f: CourtFrame) => {
  const bow = f.at('bow') * (1 - f.at('lift'));
  const up = f.at('lift');
  NUMBERS.gazeX = lerp(lerp(KNOBS.gazeX, -140, bow), AT_JUDGE[0], up);
  NUMBERS.gazeY = lerp(lerp(KNOBS.gazeY, 260, bow), AT_JUDGE[1], up);
  NUMBERS.follow = 0.1 * up;
  return {
    timelines: [
      ['breath', f.t % TIMELINES.breath.seconds],
      ['bow', cueTime(f, 'bow', 'bow')],
      ['stamp', cueTime(f, 'stamp', 'stamp')],
      ['lift', cueTime(f, 'lift', 'lift'), f.t > f.cue('lift').start ? 1 : 0],
      // The paper's crawl: the boil's twelve ticks a second, the film's own tick.
      ['boil', (f.boil % 12) / 12 + 1e-4],
    ] as const,
    numbers: NUMBERS,
  };
};

/** The accused drawn by the rig the look declares (`Look.rigs.accused`), feet at the origin. */
export const riveAccused = (f: CourtFrame) => f.rive('accused', poseOf(f));
