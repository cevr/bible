// RBF's Rive project: every figure rig of the film in one file
// (`figures.riv`, built by `build.ts`), laid by one table (`FIGURES`), which
// the house prints (`@bible/film/style` `figuresRml`). Each artboard has its
// own view model, its name, the seed its paper's boil crawls by and its place
// on the stage. It draws a composed figure, with the artboard its hands are
// drawn on: the lead, the judge, the prosecutor, Christ in each of His two
// views, and the farmer. Or it draws a circle hand: Christ's is held out to
// us at each size it grows through (`hand-rig.ts`). The figures' ink is the
// house look's line, as heavy against a head as the kept concept draws it
// (`WEIGHT`). The house prints each locked figure's print alone, which its
// lock holds (`lockedPrints`), as the file draws it, and lists every
// override the figures carry with the artboard it is laid on
// (`figureOverrides`), to be held to the owner's words. Pure.

import { figuresFile } from '@bible/film/style';
import { christ, christFront } from './christ-rig.ts';
import { farmer } from './farmer-rig.ts';
import { HAND_OUT_STEPS } from './hand-rig.ts';
import { judge } from './judge-rig.ts';
import { lead } from './lead-rig.ts';
import { prosecutor } from './prosecutor-rig.ts';

/**
 * The figures' ink against the study's: the concept `cold-34` lines a head
 * 8 px of 164 (0.049), the study's line 0.035 of the lead's head.
 */
const WEIGHT = 1.45;

/** RBF's figures file: each artboard by its key, in the order the file draws them, left to right on the stage. */
export const FIGURES = figuresFile({
  weight: WEIGHT,
  boards: {
    lead: { name: 'Lead', seed: 2301, stage: 0, figure: lead, hands: 'leadHand' },
    leadHand: { name: 'LeadHand', seed: 2302, stage: 400, hand: lead.hands.paper },
    judge: { name: 'Judge', seed: 2303, stage: 520, figure: judge, hands: 'skinHand' },
    prosecutor: {
      name: 'Prosecutor',
      seed: 2304,
      stage: 1020,
      figure: prosecutor,
      hands: 'skinHand',
    },
    // The judge's and the prosecutor's hands: one artboard, of the paper both are composed with.
    skinHand: { name: 'SkinHand', seed: 2305, stage: 1420, hand: judge.hands.paper },
    christ: { name: 'Christ', seed: 2306, stage: 1540, figure: christ, hands: 'christHand' },
    // Christ's hands, either view's: one artboard, of the paper He is composed with.
    christHand: { name: 'ChristHand', seed: 2307, stage: 1860, hand: christ.hands.paper },
    farmer: { name: 'Farmer', seed: 2308, stage: 1960, figure: farmer, hands: 'farmerHand' },
    farmerHand: { name: 'FarmerHand', seed: 2309, stage: 2280, hand: farmer.hands.paper },
    christFront: {
      name: 'ChristFront',
      seed: 2310,
      stage: 2400,
      figure: christFront,
      hands: 'christHand',
    },
    // Christ's hand held out to us, an artboard for each size it grows through, smallest first.
    christHandOut1: {
      name: 'ChristHandOut1',
      seed: 2311,
      stage: 2720,
      hand: christ.hands.paper,
      size: HAND_OUT_STEPS[0],
    },
    christHandOut2: {
      name: 'ChristHandOut2',
      seed: 2312,
      stage: 2800,
      hand: christ.hands.paper,
      size: HAND_OUT_STEPS[1],
    },
    christHandOut3: {
      name: 'ChristHandOut3',
      seed: 2313,
      stage: 2900,
      hand: christ.hands.paper,
      size: HAND_OUT_STEPS[2],
    },
    christHandOut4: {
      name: 'ChristHandOut4',
      seed: 2314,
      stage: 3020,
      hand: christ.hands.paper,
      size: HAND_OUT_STEPS[3],
    },
  },
});

/** The artboards, by name: what a prop asks the file for. */
export const ARTBOARDS = FIGURES.artboards;
