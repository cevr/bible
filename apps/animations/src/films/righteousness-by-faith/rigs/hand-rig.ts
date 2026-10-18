// Christ's hand held out to us (court onYou) grows past the house hand, so
// the film lays it in artboards of its own (`figures.ts`): how far it grows
// (`HAND_OUT`), and the steps it grows in (`HAND_OUT_STEPS`), each an
// artboard the house draws its circle hand on at that size in the house
// line (a hand's `size` in its figures file, `@bible/film/style`
// `figuresFile`), so its ink stays its figure's.
// Every other hand is the house's at its own size. Pure.

/**
 * How far past the house hand Christ's held-out hand grows as He reaches to
 * us (court onYou): its circle as court.you draws it against His face.
 */
export const HAND_OUT = 1.62;

/**
 * The held-out hand's artboards, each `size` times the house hand in the
 * house line: four steps to `HAND_OUT`, each about 1.13 times the last, so the
 * step nearest a reach, scaled the rest of the way, draws the house line
 * within 7 %.
 */
export const HAND_OUT_STEPS = [
  HAND_OUT ** 0.25,
  HAND_OUT ** 0.5,
  HAND_OUT ** 0.75,
  HAND_OUT,
] as const;
