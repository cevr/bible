// The court's rigs as a look declares them (`Look.rigs`): each artboard of
// `figures.riv` (`figures.ts`) with the timelines a pose may name, the view
// model's numbers it may set, and where on it our origin stands. A look names
// the engine; the film loads the rigs the look in play declares before its
// first frame, and the look's drawing poses each by name (`f.rive`).

import type { RiveEngine, RivePropSpec } from '@bible/film/rive';
import { Record as Rec } from 'effect';
import {
  ACCUSED_ART,
  ACCUSED_FACE,
  ACCUSED_KNOBS,
  ACCUSED_TIMELINES,
  ARTBOARDS,
  type AccusedTimeline,
  HAND_ART,
  JUDGE_ART,
  JUDGE_FACE,
  JUDGE_KNOBS,
  JUDGE_TIMELINES,
  type JudgeTimeline,
} from './figures.ts';
import figuresRiv from './figures.riv' with { type: 'file' };

/** The accused for `engine`: feet at our origin, its face for `check`; posed by its own names. */
export const accusedProp = (
  engine: RiveEngine,
): RivePropSpec<AccusedTimeline, keyof typeof ACCUSED_KNOBS> => ({
  source: {
    riv: figuresRiv,
    artboard: ARTBOARDS.accused,
    timelines: Rec.keys(ACCUSED_TIMELINES),
    numbers: Rec.keys(ACCUSED_KNOBS),
  },
  engine,
  key: `cold-studies/accused/${engine}`,
  origin: ACCUSED_ART.feet,
  face: ACCUSED_FACE,
});

/** The judge for `engine`: his head's centre at our origin, his face for `check`. */
export const judgeProp = (
  engine: RiveEngine,
): RivePropSpec<JudgeTimeline, keyof typeof JUDGE_KNOBS> => ({
  source: {
    riv: figuresRiv,
    artboard: ARTBOARDS.judge,
    timelines: Rec.keys(JUDGE_TIMELINES),
    numbers: Rec.keys(JUDGE_KNOBS),
  },
  engine,
  key: `cold-studies/judge/${engine}`,
  origin: JUDGE_ART.head,
  face: JUDGE_FACE,
});

/** The judge's hand for `engine`, its centre at our origin: no view model, only its paper's crawl. */
export const handProp = (engine: RiveEngine): RivePropSpec<'boil', never> => ({
  source: { riv: figuresRiv, artboard: ARTBOARDS.hand, timelines: ['boil'], numbers: [] },
  engine,
  key: `cold-studies/hand/${engine}`,
  origin: [HAND_ART.width / 2, HAND_ART.height / 2],
});
