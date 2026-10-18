// RBF's Rive project: every figure rig of the film in one file
// (`figures.riv`, built by `build.ts`), each an artboard with its own view
// model, all made from the house generator's parts (`@bible/film/style/rig`)
// in the house look's direction (K1, `DIRECTION`), their ink as heavy against a head as
// the kept concept draws it (`WEIGHT`). Pure: `figuresRml()` is the whole
// project file, the same text for the same code.

import { DIRECTION, figure, fragment, ids } from '@bible/film/style/rig';
import { CHRIST, CHRIST_KNOBS } from './christ-rig.ts';
import { handRig } from './hand-rig.ts';
import { judgeRig } from './judge-rig.ts';
import { leadRig } from './lead-rig.ts';
import { PAPERS } from './papers.ts';
import { prosecutorRig } from './prosecutor-rig.ts';
import { robedRig } from './robed-rig.ts';

/** The artboards, by name: what a prop asks the file for. */
export const ARTBOARDS = {
  lead: 'Lead',
  leadHand: 'LeadHand',
  judge: 'Judge',
  prosecutor: 'Prosecutor',
  skinHand: 'SkinHand',
  christ: 'Christ',
  christHand: 'ChristHand',
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
    ...leadRig(figure(next, ARTBOARDS.lead, 2301, 0, d)),
    ...handRig(figure(next, ARTBOARDS.leadHand, 2302, 400, d), { ...PAPERS.lead, rim: 3.5 }),
    ...judgeRig(figure(next, ARTBOARDS.judge, 2303, 520, d)),
    ...prosecutorRig(figure(next, ARTBOARDS.prosecutor, 2304, 1020, d)),
    ...handRig(figure(next, ARTBOARDS.skinHand, 2305, 1420, d), { ...PAPERS.skinHand, rim: 4 }),
    ...robedRig(figure(next, ARTBOARDS.christ, 2306, 1540, d), CHRIST, CHRIST_KNOBS),
    ...handRig(figure(next, ARTBOARDS.christHand, 2307, 1860, d), {
      ...PAPERS.christSkin,
      crease: PAPERS.skinHand.crease,
      rim: 4,
    }),
  ]);
};
