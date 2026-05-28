/* `prefers-reduced-motion` read. motion-dom keeps a mutable `{ current }` ref
   updated by a media-query listener; we initialise it lazily so callers don't
   need to coordinate setup. */
import { initPrefersReducedMotion, prefersReducedMotion } from 'motion-dom';

let booted = false;
const ensureListener = (): void => {
  if (booted) return;
  initPrefersReducedMotion();
  booted = true;
};

/** Module-level read for non-component code paths (e.g. the <Motion> driver
    deciding whether to .jump() instead of animating). */
export const isReducedMotion = (): boolean => {
  ensureListener();
  return prefersReducedMotion.current === true;
};
