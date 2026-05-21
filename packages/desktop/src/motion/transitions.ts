/* Curated re-exports of the transition primitives our app actually uses.

   motion-dom exposes a sprawling animation system — these are the bits we
   reach for from app code so we don't accidentally couple to internals. */
export {
  spring,
  inertia,
  keyframes,
  type SpringOptions,
  type Transition,
  type ValueAnimationTransition,
} from 'motion-dom';

/* Hand-tuned defaults that match the desktop's drawer/sheet cubic-bezier
   timings (used inline in app.tsx as
   `[transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)]`), so motion-
   driven animations feel identical to the CSS ones. */
export const defaultEase = [0.2, 0.8, 0.2, 1] as const;

export const standardSpring = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 36,
};

export const overlayTween = {
  type: 'tween' as const,
  duration: 0.22,
  ease: defaultEase,
};

export const fadeTween = {
  type: 'tween' as const,
  duration: 0.15,
  ease: defaultEase,
};
