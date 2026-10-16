// RBF's Rive project: every figure rig of the film in one file
// (`figures.riv`, built by `build.ts`), each an artboard with its own view
// model, all made from the cold-studies generator's parts in the house
// look's direction (K1, `DIRECTION`), their ink as heavy against a head as
// the kept concept draws it (`WEIGHT`). Pure: `figuresRml()` is the whole
// project file, the same text for the same code.

import { DIRECTION } from '../../cold-studies/looks/rive/direction.ts';
import { figure } from '../../cold-studies/looks/rive/parts.ts';
import { fragment, ids } from '../../cold-studies/looks/rive/rml.ts';
import { handRig } from './hand-rig.ts';
import { judgeRig } from './judge-rig.ts';
import { leadRig } from './lead-rig.ts';
import { PAPERS } from './papers.ts';
import { prosecutorRig } from './prosecutor-rig.ts';

/** The artboards, by name: what a prop asks the file for. */
export const ARTBOARDS = {
  lead: 'Lead',
  leadHand: 'LeadHand',
  judge: 'Judge',
  prosecutor: 'Prosecutor',
  skinHand: 'SkinHand',
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
    ...handRig(figure(next, ARTBOARDS.leadHand, 2302, 400, d), PAPERS.lead),
    ...judgeRig(figure(next, ARTBOARDS.judge, 2303, 520, d)),
    ...prosecutorRig(figure(next, ARTBOARDS.prosecutor, 2304, 1020, d)),
    ...handRig(figure(next, ARTBOARDS.skinHand, 2305, 1420, d), PAPERS.skin),
  ]);
};
