// The court's Rive project: every figure rig in one file (`figures.riv`, built
// by `build.ts` from `DIRECTION`), each an artboard of its own with its own
// view model, all made from the same parts (`parts.ts`) in one art direction
// (`direction.ts`). Pure: `figuresRml(d)` is the whole project file, the same
// text for the same code and direction.

import { accusedRig } from './accused-rig.ts';
import type { Direction } from './direction.ts';
import { handRig, judgeRig } from './judge-rig.ts';
import { figure } from './parts.ts';
import { fragment, ids } from './rml.ts';

/** The artboards, by name: what a prop asks the file for. */
export const ARTBOARDS = { accused: 'Accused', judge: 'Judge', hand: 'Hand' } as const;

/** Each rig of the project in `d`: its artboard, then its view model when it has one; one id counter for the file. */
export const figureRigs = (d: Direction) => {
  const next = ids();
  return {
    accused: accusedRig(figure(next, ARTBOARDS.accused, 1888, 0, d)),
    judge: judgeRig(figure(next, ARTBOARDS.judge, 1889, 400, d)),
    hand: handRig(figure(next, ARTBOARDS.hand, 1890, 840, d)),
  };
};

/** The whole project file in `d`. */
export const figuresRml = (d: Direction): string => {
  const { accused, judge, hand } = figureRigs(d);
  return fragment([...accused, ...judge, ...hand]);
};
