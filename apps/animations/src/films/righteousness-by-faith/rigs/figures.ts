// RBF's Rive project: every figure rig of the film in one file
// (`figures.riv`, built by `build.ts`), each an artboard with its own view
// model, all drawn on the house generator's parts (`@bible/film/style/rig`):
// the composed lead, judge and prosecutor by `drawFigure`, every circle hand
// by `drawHand` (Christ's held out to us at each size it grows through,
// `hand-rig.ts`), Christ and the farmer by their own rig (`robedRig`); in the
// house look's direction (K1, `DIRECTION`), their ink as heavy against a
// head as the kept concept draws it (`WEIGHT`).
// Pure: `figuresRml()` is the whole project file, the same text for the
// same code.

import { DIRECTION, drawFigure, drawHand, figure, fragment, ids } from '@bible/film/style/rig';
import { CHRIST, CHRIST_FRONT, CHRIST_FRONT_KNOBS, CHRIST_KNOBS } from './christ-rig.ts';
import { FARMER, FARMER_KNOBS } from './farmer-rig.ts';
import { HAND_OUT_STEPS } from './hand-rig.ts';
import { judge } from './judge-rig.ts';
import { lead } from './lead-rig.ts';
import { PAPERS } from './papers.ts';
import { prosecutor } from './prosecutor-rig.ts';
import { robedRig } from './robed-rig.ts';

/** The artboards, by name: what a prop asks the file for. */
export const ARTBOARDS = {
  lead: 'Lead',
  leadHand: 'LeadHand',
  judge: 'Judge',
  prosecutor: 'Prosecutor',
  skinHand: 'SkinHand',
  christ: 'Christ',
  christFront: 'ChristFront',
  christHand: 'ChristHand',
  christHandOut1: 'ChristHandOut1',
  christHandOut2: 'ChristHandOut2',
  christHandOut3: 'ChristHandOut3',
  christHandOut4: 'ChristHandOut4',
  farmer: 'Farmer',
  farmerHand: 'FarmerHand',
} as const;

/**
 * The figures' ink against the study's: the concept `cold-34` lines a head
 * 8 px of 164 (0.049), the study's line 0.035 of the lead's head.
 */
const WEIGHT = 1.45;

/** The whole project file: each rig's artboard, then its view model; one id counter for the file. */
export const figuresRml = (): string => {
  const next = ids();
  const d = { ...DIRECTION, weight: WEIGHT };
  return fragment([
    ...drawFigure(figure(next, ARTBOARDS.lead, 2301, 0, d), lead),
    ...drawHand(figure(next, ARTBOARDS.leadHand, 2302, 400, d), lead.hands.paper),
    ...drawFigure(figure(next, ARTBOARDS.judge, 2303, 520, d), judge),
    ...drawFigure(figure(next, ARTBOARDS.prosecutor, 2304, 1020, d), prosecutor),
    // The judge's and the prosecutor's hands: one paper, the skin's.
    ...drawHand(figure(next, ARTBOARDS.skinHand, 2305, 1420, d), PAPERS.skinHand),
    ...robedRig(figure(next, ARTBOARDS.christ, 2306, 1540, d), CHRIST, CHRIST_KNOBS),
    ...drawHand(figure(next, ARTBOARDS.christHand, 2307, 1860, d), {
      ...PAPERS.christSkin,
      crease: PAPERS.skinHand.crease,
      rim: 4,
    }),
    ...robedRig(figure(next, ARTBOARDS.farmer, 2308, 1960, d), FARMER, FARMER_KNOBS),
    ...drawHand(figure(next, ARTBOARDS.farmerHand, 2309, 2280, d), {
      ...PAPERS.farmerSkin,
      crease: PAPERS.skinHand.crease,
      rim: 4,
    }),
    ...robedRig(
      figure(next, ARTBOARDS.christFront, 2310, 2400, d),
      CHRIST_FRONT,
      CHRIST_FRONT_KNOBS,
    ),
    ...(
      [
        [ARTBOARDS.christHandOut1, 2311, 2720],
        [ARTBOARDS.christHandOut2, 2312, 2800],
        [ARTBOARDS.christHandOut3, 2313, 2900],
        [ARTBOARDS.christHandOut4, 2314, 3020],
      ] as const
    ).flatMap(([name, id, y], i) =>
      drawHand(
        figure(next, name, id, y, d),
        { ...PAPERS.christSkin, crease: PAPERS.skinHand.crease, rim: 4 },
        HAND_OUT_STEPS[i],
      ),
    ),
  ]);
};
