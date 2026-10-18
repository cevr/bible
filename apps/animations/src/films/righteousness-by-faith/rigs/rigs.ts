// RBF's figure rigs as a drawing declares them (`drawing({ rigs })`): each
// artboard of `figures.riv` (`figures.ts`) with the timelines a pose may
// name, the view model's numbers it may set, and where on it our origin
// stands. Canvas 2D is the engine, and every scene draws them the same way.

import type { RivePropSpec } from '@bible/film/rive';
import { HAND_ART } from '@bible/film/style/rig';
import { Record as Rec } from 'effect';
import { ARTBOARDS } from './figures.ts';
import figuresRiv from './figures.riv' with { type: 'file' };
import { CHRIST, CHRIST_FRONT, CHRIST_FRONT_KNOBS, CHRIST_KNOBS } from './christ-rig.ts';
import { FARMER, FARMER_KNOBS, type FarmerKnob } from './farmer-rig.ts';
import { HAND_OUT_STEPS } from './hand-rig.ts';
import {
  JUDGE_ART,
  JUDGE_FACE_CHECK,
  JUDGE_KNOBS,
  JUDGE_TIMELINES,
  type JudgeTimeline,
} from './judge-rig.ts';
import {
  LEAD_FACE_CHECK,
  LEAD_KNOBS,
  LEAD_TIMELINES,
  type LeadTimeline,
  lead,
} from './lead-rig.ts';
import {
  PROSECUTOR_ART,
  PROSECUTOR_FACE_CHECK,
  PROSECUTOR_KNOBS,
  PROSECUTOR_TIMELINES,
  type ProsecutorTimeline,
} from './prosecutor-rig.ts';
import {
  ROBED_TIMELINES,
  type RobedKnob,
  type RobedTimeline,
  robedFaceCheck,
} from './robed-rig.ts';

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
  origin: lead.art.feet,
  face: LEAD_FACE_CHECK,
  concept: lead.concept,
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

/** Christ: His feet at our origin. */
export const christProp: RivePropSpec<RobedTimeline, RobedKnob> = {
  source: {
    riv: figuresRiv,
    artboard: ARTBOARDS.christ,
    timelines: Rec.keys(ROBED_TIMELINES),
    numbers: Rec.keys(CHRIST_KNOBS),
  },
  engine: 'canvas',
  key: 'righteousness-by-faith/christ',
  origin: CHRIST.art.feet,
  face: robedFaceCheck(CHRIST),
  // `film match`'s concept: Christ beside the accused in court.12, the kept concept His head and face are traced from.
  concept: {
    image: { set: 'rbf-v3-concepts-2026-10-15', file: 'images/5-court-12.png' },
    box: [370, 270, 575, 760],
  },
};

/** Christ turned to us (court.you): His feet at our origin, where `christProp`'s are. */
export const christFrontProp: RivePropSpec<RobedTimeline, RobedKnob> = {
  source: {
    riv: figuresRiv,
    artboard: ARTBOARDS.christFront,
    timelines: Rec.keys(ROBED_TIMELINES),
    numbers: Rec.keys(CHRIST_FRONT_KNOBS),
  },
  engine: 'canvas',
  key: 'righteousness-by-faith/christ-front',
  origin: CHRIST_FRONT.art.feet,
  face: robedFaceCheck(CHRIST_FRONT),
  // `film match`'s concept: court.you's kept try 2, His head turned to us.
  concept: {
    image: { set: 'rbf-v3-cast-2026-10-18', file: 'aids/court-you-2.png' },
    box: [700, 70, 1080, 760],
  },
};

/** The farmer of the rain: his feet at our origin. */
export const farmerProp: RivePropSpec<RobedTimeline, FarmerKnob> = {
  source: {
    riv: figuresRiv,
    artboard: ARTBOARDS.farmer,
    timelines: Rec.keys(ROBED_TIMELINES),
    numbers: Rec.keys(FARMER_KNOBS),
  },
  engine: 'canvas',
  key: 'righteousness-by-faith/farmer',
  origin: FARMER.art.feet,
  face: robedFaceCheck(FARMER),
  // `film match`'s concept: the farmer in rain.rain, the kept Board try his head is traced from, its
  // ink closed under his beard and where his headcloth meets his mantle (the Board draws none there,
  // so the face's fill ran into his body); cut at his chest, as the Board cuts him at his waist.
  concept: {
    image: { set: 'rbf-v3-cast-2026-10-18', file: 'aids/farmer-head-closed.png' },
    box: [190, 280, 720, 760],
  },
};

/** A circle hand of `artboard`, its centre at our origin: no view model, only its paper's crawl. */
const handProp = (artboard: string, key: string, size = 1): RivePropSpec<'boil', never> => ({
  source: { riv: figuresRiv, artboard, timelines: ['boil'], numbers: [] },
  engine: 'canvas',
  key: `righteousness-by-faith/${key}`,
  origin: [(HAND_ART.width * size) / 2, (HAND_ART.height * size) / 2],
});

/** The lead's hand, in his paper. */
export const leadHandProp = handProp(ARTBOARDS.leadHand, 'lead-hand');

/** A hand in the house look's skin: the judge's and the prosecutor's. */
export const skinHandProp = handProp(ARTBOARDS.skinHand, 'skin-hand');

/** Christ's hand, in His skin. */
export const christHandProp = handProp(ARTBOARDS.christHand, 'christ-hand');

/** Christ's hand held out to us, a step each of `HAND_OUT_STEPS`, in the house line. */
export const christHandOutProps = [
  handProp(ARTBOARDS.christHandOut1, 'christ-hand-out-1', HAND_OUT_STEPS[0]),
  handProp(ARTBOARDS.christHandOut2, 'christ-hand-out-2', HAND_OUT_STEPS[1]),
  handProp(ARTBOARDS.christHandOut3, 'christ-hand-out-3', HAND_OUT_STEPS[2]),
  handProp(ARTBOARDS.christHandOut4, 'christ-hand-out-4', HAND_OUT_STEPS[3]),
] as const;

/** The farmer's hand, in his skin. */
export const farmerHandProp = handProp(ARTBOARDS.farmerHand, 'farmer-hand');
