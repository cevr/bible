// Compile-time checks of the court's rig names (`tsc` runs them; nothing
// imports this module): a look's `f.rive(name, …)` poses only that rig's own
// timelines and numbers (`Look.rigs`), and the court declares no rig beyond
// the accused, the judge and his hand.

import type { CourtFrame } from './scenes/court.ts';

export const accusedPoses = (f: CourtFrame) => {
  f.rive('accused', { timelines: [['bow', 0.2]], numbers: { gazeX: 1 } });
  // @ts-expect-error: the accused has no timeline `bowe`.
  f.rive('accused', { timelines: [['bowe', 0.2]] });
  // @ts-expect-error: the accused's view model has no number `gaze`.
  f.rive('accused', { timelines: [], numbers: { gaze: 1 } });
};

export const benchPoses = (f: CourtFrame) => {
  f.rive('judge', { timelines: [['breath', 1]], numbers: { lean: -0.06 } });
  // @ts-expect-error: the judge does not bow; that timeline is the accused's.
  f.rive('judge', { timelines: [['bow', 0.2]] });
  f.rive('hand', { timelines: [['boil', 0]] });
  // @ts-expect-error: the hand only crawls; it does not breathe.
  f.rive('hand', { timelines: [['breath', 1]] });
  // @ts-expect-error: the court declares no rig `bailiff`.
  f.rive('bailiff', { timelines: [] });
};
