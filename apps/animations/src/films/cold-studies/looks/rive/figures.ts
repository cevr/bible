// What `figures.riv` holds: the court's figure rigs (the accused, the judge
// and his hand), each an artboard with its view model, built in K1 (the
// owner's pick, 2026-10-13). The style trials are closed (2026-10-14), so the
// file is frozen: committed, never rebuilt. The runtime reads these numbers
// beside it (`rigs.ts`, `accused.ts`, `judge.ts`), so they are the file's own
// and change only with it.

/** The artboards, by name: what a prop asks the file for. */
export const ARTBOARDS = { accused: 'Accused', judge: 'Judge', hand: 'Hand' } as const;

/** The accused's artboard, and where his feet stand on it (our origin). */
export const ACCUSED_ART = { width: 320, height: 300, feet: [160, 280] } as const;

/** The accused's head's centre over his feet, units: where his eyes rest and the judge looks up to. */
export const ACCUSED_HEAD = -165;

/** The accused's view model at rest: the face kit's numbers, his eyes on us. */
export const ACCUSED_KNOBS = {
  gazeX: 0,
  gazeY: ACCUSED_HEAD,
  follow: 0,
  eyes: 1,
  eyeW: 1,
  browY: 0,
  browTilt: 0,
  mouth: 0,
  mouthLine: 1,
  mouthOpen: 0,
} as const;

/** The accused's timelines a pose names: each one's authored length in seconds, and the share of it its cue spans. */
export const ACCUSED_TIMELINES = {
  breath: { seconds: 4, move: 4 },
  bow: { seconds: 1.4, move: 0.35 },
  stamp: { seconds: 0.6, move: 0.2 },
  lift: { seconds: 1.2, move: 0.37 },
  boil: { seconds: 4, move: 4 },
} as const;
export type AccusedTimeline = keyof typeof ACCUSED_TIMELINES;

/** The accused's face as `check` reads it (`RivePropSpec.face`): its node, and his head's height. */
export const ACCUSED_FACE = { node: 'face', height: 76 } as const;

/** The judge's artboard, and where his head's centre stands on it (our origin). */
export const JUDGE_ART = { width: 360, height: 360, head: [180, 140] } as const;

/** The judge's view model at rest: the face kit's numbers, his eyes down on the papers before him, upright. */
export const JUDGE_KNOBS = {
  gazeX: 10,
  gazeY: 220,
  follow: 0,
  eyes: 0.62,
  eyeW: 1,
  browY: 0,
  browTilt: 0,
  mouth: 0,
  mouthLine: 1,
  mouthOpen: 0,
  lean: 0,
} as const;

/** The judge's timelines a pose names: each one's authored length in seconds. */
export const JUDGE_TIMELINES = {
  breath: { seconds: 5, move: 5 },
  boil: { seconds: 4, move: 4 },
} as const;
export type JudgeTimeline = keyof typeof JUDGE_TIMELINES;

/** The judge's face as `check` reads it: its node, and his head's height. */
export const JUDGE_FACE = { node: 'face', height: 130 } as const;

/** The judge's hand's artboard: the hand's centre at its middle. */
export const HAND_ART = { width: 48, height: 48 } as const;

/**
 * Where the boil timeline stands on the film's boil tick `tick`: the file's
 * boil is 48 ticks at 12 a second, each held, a four-second loop.
 */
export const boilTime = (tick: number) => (tick % 48) / 12 + 1e-4;
