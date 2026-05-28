/* Barrel for desktop/src/motion — Solid-native motion library built on
   motion-dom. See docs/motion-design.md for the design rationale.

   Only the symbols actually consumed by callers are exposed; speculative
   re-exports (animateValue/animateStyle, MV bridges, raf helpers, the
   spring/tween presets) have been removed. Reach into the submodule directly
   if you need an internal — that's the signal we should widen the surface. */

export { defaultEase } from './transitions.js';
export type { SpringOptions, Transition, ValueAnimationTransition } from './transitions.js';

export { isReducedMotion } from './reduced-motion.js';

export { Motion, type MotionProps } from './Motion.jsx';
export { Presence, usePresence, type PresenceState } from './Presence.jsx';

export {
  useDrag,
  type DragAxis,
  type DragConstraints,
  type DragInfo,
  type UseDragHandle,
  type UseDragOptions,
} from './gestures/use-drag.js';
