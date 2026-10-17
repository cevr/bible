// RBF's figure rigs as a drawing declares them (`drawing({ rigs })`): each
// artboard of `figures.riv` (`figures.ts`) with the timelines a pose may
// name, the view model's numbers it may set, and where on it our origin
// stands. Canvas 2D is the engine, and every scene draws them the same way.

import type { RivePropSpec } from '@bible/film/rive';
import { Record as Rec } from 'effect';
import { ARTBOARDS } from './figures.ts';
import figuresRiv from './figures.riv' with { type: 'file' };
import { HAND_ART } from './hand-rig.ts';
import {
  JUDGE_ART,
  JUDGE_FACE_CHECK,
  JUDGE_KNOBS,
  JUDGE_TIMELINES,
  type JudgeTimeline,
} from './judge-rig.ts';
import {
  LEAD_ART,
  LEAD_FACE_CHECK,
  LEAD_KNOBS,
  LEAD_TIMELINES,
  type LeadTimeline,
} from './lead-rig.ts';
import {
  PROSECUTOR_ART,
  PROSECUTOR_FACE_CHECK,
  PROSECUTOR_KNOBS,
  PROSECUTOR_TIMELINES,
  type ProsecutorTimeline,
} from './prosecutor-rig.ts';

/** The plain lead: his feet at our origin. */
export const leadProp: RivePropSpec<LeadTimeline, keyof typeof LEAD_KNOBS> = {
  source: {
    riv: figuresRiv,
    artboard: ARTBOARDS.lead,
    timelines: Rec.keys(LEAD_TIMELINES),
    numbers: Rec.keys(LEAD_KNOBS),
  },
  engine: 'canvas',
  key: 'righteousness-by-faith/lead',
  origin: LEAD_ART.feet,
  face: LEAD_FACE_CHECK,
  // `film match`'s concept: the plain lead's model sheet, his front view.
  concept: {
    image: { set: 'rbf-v3-concepts-2026-10-15', file: 'images/0-plain-lead-sheet.png' },
    box: [165, 370, 455, 785],
  },
};

/** The judge: his head's centre at our origin. */
export const judgeProp: RivePropSpec<JudgeTimeline, keyof typeof JUDGE_KNOBS> = {
  source: {
    riv: figuresRiv,
    artboard: ARTBOARDS.judge,
    timelines: Rec.keys(JUDGE_TIMELINES),
    numbers: Rec.keys(JUDGE_KNOBS),
  },
  engine: 'canvas',
  key: 'righteousness-by-faith/judge',
  origin: JUDGE_ART.head,
  face: JUDGE_FACE_CHECK,
  // `film match`'s concept: the judge at his bench in cold.34, the kept concept.
  concept: {
    image: { set: 'rbf-v3-concepts-2026-10-15', file: 'images/1-cold-34.png' },
    box: [1110, 95, 1510, 410],
  },
};

/** The prosecutor: his feet at our origin. */
export const prosecutorProp: RivePropSpec<ProsecutorTimeline, keyof typeof PROSECUTOR_KNOBS> = {
  source: {
    riv: figuresRiv,
    artboard: ARTBOARDS.prosecutor,
    timelines: Rec.keys(PROSECUTOR_TIMELINES),
    numbers: Rec.keys(PROSECUTOR_KNOBS),
  },
  engine: 'canvas',
  key: 'righteousness-by-faith/prosecutor',
  origin: PROSECUTOR_ART.feet,
  face: PROSECUTOR_FACE_CHECK,
  // `film match`'s concept: the prosecutor pointing in cold.34, the kept concept.
  concept: {
    image: { set: 'rbf-v3-concepts-2026-10-15', file: 'images/1-cold-34.png' },
    box: [560, 200, 900, 830],
  },
};

/** A circle hand of `artboard`, its centre at our origin: no view model, only its paper's crawl. */
const handProp = (artboard: string, key: string): RivePropSpec<'boil', never> => ({
  source: { riv: figuresRiv, artboard, timelines: ['boil'], numbers: [] },
  engine: 'canvas',
  key: `righteousness-by-faith/${key}`,
  origin: [HAND_ART.width / 2, HAND_ART.height / 2],
});

/** The lead's hand, in his paper. */
export const leadHandProp = handProp(ARTBOARDS.leadHand, 'lead-hand');

/** A hand in the house look's skin: the judge's and the prosecutor's. */
export const skinHandProp = handProp(ARTBOARDS.skinHand, 'skin-hand');
