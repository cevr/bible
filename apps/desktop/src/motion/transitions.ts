/* Curated transition primitives our app actually uses. */
export type { SpringOptions, Transition, ValueAnimationTransition } from 'motion-dom';

/* Hand-tuned cubic-bezier that matches the desktop's drawer/sheet timings,
   so motion-driven animations feel identical to the CSS ones declared as
   `[transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)]`. */
export const defaultEase = [0.2, 0.8, 0.2, 1] as const;
