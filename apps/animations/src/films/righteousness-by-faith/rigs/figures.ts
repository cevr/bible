// RBF's Rive project: every figure rig of the film in one file
// (`figures.riv`, built by `build.ts`), each an artboard with its own view
// model, all drawn on the house generator's parts (`@bible/film/style/rig`):
// the composed lead, judge and prosecutor by `drawFigure`, every circle hand
// by `drawHand` (Christ's held out to us at each size it grows through,
// `hand-rig.ts`), Christ and the farmer by their own rig (`robedRig`); in the
// house look's direction (K1, `DIRECTION`), their ink as heavy against a
// head as the kept concept draws it (`WEIGHT`). Each artboard is laid in the
// file by one table (`LAID`: its boil's seed, its place on the stage), so a
// locked figure's print alone (`aloneRml`), which its lock holds
// (`lockedPrints`), is drawn as the file draws it.
// Pure: `figuresRml()` is the whole project file, the same text for the
// same code.

import type { ComposedFigure } from '@bible/film/style';
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

/** An artboard, by its key. */
type Board = keyof typeof ARTBOARDS;

/** Where the file lays each artboard: the seed its paper's boil crawls by, and its place on the editor's stage, left to right. */
const LAID = {
  lead: { seed: 2301, stage: 0 },
  leadHand: { seed: 2302, stage: 400 },
  judge: { seed: 2303, stage: 520 },
  prosecutor: { seed: 2304, stage: 1020 },
  skinHand: { seed: 2305, stage: 1420 },
  christ: { seed: 2306, stage: 1540 },
  christHand: { seed: 2307, stage: 1860 },
  farmer: { seed: 2308, stage: 1960 },
  farmerHand: { seed: 2309, stage: 2280 },
  christFront: { seed: 2310, stage: 2400 },
  christHandOut1: { seed: 2311, stage: 2720 },
  christHandOut2: { seed: 2312, stage: 2800 },
  christHandOut3: { seed: 2313, stage: 2900 },
  christHandOut4: { seed: 2314, stage: 3020 },
} as const satisfies Record<Board, { readonly seed: number; readonly stage: number }>;

/**
 * The figures' ink against the study's: the concept `cold-34` lines a head
 * 8 px of 164 (0.049), the study's line 0.035 of the lead's head.
 */
const WEIGHT = 1.45;

/** The figures' line: the house look's, at their weight. */
const LINE = { ...DIRECTION, weight: WEIGHT };

/** Artboard `key`, its ids from `next`, laid where the file lays it, or at `stage`. */
const board = (next: () => string, key: Board, stage: number = LAID[key].stage) =>
  figure(next, ARTBOARDS[key], LAID[key].seed, stage, LINE);

/** Christ's hands' paper: His skin, creased as the house skin is. */
const CHRIST_HAND = { ...PAPERS.christSkin, crease: PAPERS.skinHand.crease, rim: 4 };

/** The artboards of Christ's hand held out to us, one for each of its sizes (`HAND_OUT_STEPS`), smallest first. */
const HAND_OUT_BOARDS = [
  'christHandOut1',
  'christHandOut2',
  'christHandOut3',
  'christHandOut4',
] as const satisfies ReadonlyArray<Board>;

/** The whole project file: each rig's artboard, then its view model; one id counter for the file. */
export const figuresRml = (): string => {
  const next = ids();
  return fragment([
    ...drawFigure(board(next, 'lead'), lead),
    ...drawHand(board(next, 'leadHand'), lead.hands.paper),
    ...drawFigure(board(next, 'judge'), judge),
    ...drawFigure(board(next, 'prosecutor'), prosecutor),
    // The judge's and the prosecutor's hands: one artboard, of the paper both are composed with.
    ...drawHand(board(next, 'skinHand'), judge.hands.paper),
    ...robedRig(board(next, 'christ'), CHRIST, CHRIST_KNOBS),
    ...drawHand(board(next, 'christHand'), CHRIST_HAND),
    ...robedRig(board(next, 'farmer'), FARMER, FARMER_KNOBS),
    ...drawHand(board(next, 'farmerHand'), {
      ...PAPERS.farmerSkin,
      crease: PAPERS.skinHand.crease,
      rim: 4,
    }),
    ...robedRig(board(next, 'christFront'), CHRIST_FRONT, CHRIST_FRONT_KNOBS),
    // Christ's hand held out to us, a board for each size it grows through.
    ...HAND_OUT_BOARDS.flatMap((key, i) =>
      drawHand(board(next, key), CHRIST_HAND, HAND_OUT_STEPS[i]),
    ),
  ]);
};

/**
 * `f`'s print alone: its artboard (`item`) and its hands' (`hand`), each
 * with the seed the file lays it with, numbered by a counter of their own
 * and laid at the stage's start, so it is the same text wherever the file
 * lays them and whatever it draws before them. A lock holds it.
 */
export const aloneRml = (item: Board, f: ComposedFigure<string>, hand: Board): string => {
  const next = ids();
  return fragment([
    ...drawFigure(board(next, item, 0), f),
    ...drawHand(board(next, hand, 0), f.hands.paper),
  ]);
};

/** The composed figures, each by the artboard it is laid as, with its hands'. */
const COMPOSED = [
  { item: 'lead', figure: lead, hand: 'leadHand' },
  { item: 'judge', figure: judge, hand: 'skinHand' },
  { item: 'prosecutor', figure: prosecutor, hand: 'skinHand' },
] as const;

/**
 * Each locked figure, by the artboard it is laid as, with its lock and its
 * print alone (`aloneRml`): what its build and its test hold to its lock
 * (`unlocked`, `@bible/film/style/build`).
 */
export const lockedPrints = () =>
  COMPOSED.flatMap(({ item, figure: f, hand }) =>
    f.lock === undefined ? [] : [{ item, lock: f.lock, print: aloneRml(item, f, hand) }],
  );
