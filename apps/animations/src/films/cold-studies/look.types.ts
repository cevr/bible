// Compile-time checks of the court's rig names (`tsc` runs them; nothing
// imports this module): a look's `f.rive('accused', …)` poses only the
// accused rig's own timelines and numbers (`Look.rigs`), and the court
// declares no other rig.

import type { CourtFrame } from './scenes/court.ts';

export const accusedPoses = (f: CourtFrame) => {
  f.rive('accused', { timelines: [['bow', 0.2]], numbers: { gazeX: 1 } });
  // @ts-expect-error: the accused has no timeline `bowe`.
  f.rive('accused', { timelines: [['bowe', 0.2]] });
  // @ts-expect-error: the accused's view model has no number `gaze`.
  f.rive('accused', { timelines: [], numbers: { gaze: 1 } });
  // @ts-expect-error: the court declares no rig `judge`.
  f.rive('judge', { timelines: [] });
};
