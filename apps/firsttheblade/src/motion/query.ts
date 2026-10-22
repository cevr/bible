/** The media query a reader who asks for less motion matches: the stills then stay still. */
export const LESS_MOTION = '(prefers-reduced-motion: reduce)';

/** The media query a coarse pointer (a finger) matches: the hero's rays then rest at the still's angles while its plants still sway. */
export const COARSE_POINTER = '(pointer: coarse)';

/**
 * Whether the hero's rays turn (`TURN`, `./sun.ts`) for a reader whose
 * browser answers each media query with `matches`: not when they ask for
 * less motion, nor with a coarse pointer.
 */
export const raysTurn = (matches: (query: string) => boolean) =>
  !matches(LESS_MOTION) && !matches(COARSE_POINTER);
