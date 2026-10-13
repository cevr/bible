// The court's Rive project: every figure rig in one file (`figures.riv`, built
// by `build.ts`), each an artboard of its own with its own view model, all
// made from the same parts (`parts.ts`). Pure: `figuresRml()` is the whole
// project file, the same text for the same code.

import { accusedRig } from './accused-rig.ts';
import { handRig, judgeRig } from './judge-rig.ts';
import { figure } from './parts.ts';
import { fragment, ids } from './rml.ts';

/** The artboards, by name: what a prop asks the file for. */
export const ARTBOARDS = { accused: 'Accused', judge: 'Judge', hand: 'Hand' } as const;

/** The whole project file. */
export const figuresRml = (): string => {
  const next = ids();
  return fragment([
    ...accusedRig(figure(next, ARTBOARDS.accused, 1888, 0)),
    ...judgeRig(figure(next, ARTBOARDS.judge, 1889, 400)),
    ...handRig(figure(next, ARTBOARDS.hand, 1890, 840)),
  ]);
};
