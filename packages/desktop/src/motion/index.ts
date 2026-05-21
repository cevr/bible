/* Barrel for desktop/src/motion — Solid-native motion library built on
   motion-dom. See docs/motion-design.md for the design rationale. */

export { useMotionValue, useSpring, useTransform, syncSignalToMotionValue } from './value.js';

export { animateValue, animateStyle } from './animate.js';

export {
  defaultEase,
  fadeTween,
  overlayTween,
  spring,
  standardSpring,
  inertia,
  keyframes,
} from './transitions.js';
export type { SpringOptions, Transition, ValueAnimationTransition } from './transitions.js';

export { isReducedMotion, useReducedMotion } from './reduced-motion.js';

export { mvSignal, newMotionValue } from './internals/bridge.js';
export { frame, microtask, time } from './internals/raf.js';

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

export type { MotionValue } from 'motion-dom';
