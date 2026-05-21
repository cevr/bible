/* Minimal Motion driver: applies `initial` styles, animates to `animate` on
   mount and on every animate-prop change, and (when wrapped in <Presence>)
   animates to `exit` before allowing removal.

   What this intentionally does NOT do (vs framer-motion's full driver):
   - No variants / variant inheritance
   - No layout / shared-layout
   - No hover/press/inView (separate gesture hooks in C4)
   - No transform compositing — each CSS prop animates as its own WAAPI
     Animation. The browser composes the resulting transform/scale/translate
     individually, which works for our case because we never combine x+scale
     on the same element today.

   When any of those become a need, swap in motion-dom's createMotionState
   or extend here. Until then this is the smaller blast radius. */
import {
  startWaapiAnimation,
  type ValueKeyframesDefinition,
  type ValueTransition,
} from 'motion-dom';
import { isReducedMotion } from '../reduced-motion.js';

export type MotionTarget = Record<string, number | string>;

const PX_PROPS = new Set(['width', 'height', 'top', 'left', 'right', 'bottom', 'translate']);

/** Map shorthand keys (x, y, scale, rotate) to their CSS-property + value
    form. Anything else passes through with a heuristic px-or-bare formatting. */
const toCss = (key: string, value: number | string): { property: string; value: string } => {
  if (key === 'x') {
    return {
      property: 'translate',
      value: typeof value === 'number' ? `${value}px 0` : value,
    };
  }
  if (key === 'y') {
    return {
      property: 'translate',
      value: typeof value === 'number' ? `0 ${value}px` : value,
    };
  }
  if (key === 'scale') return { property: 'scale', value: String(value) };
  if (key === 'rotate') {
    return {
      property: 'rotate',
      value: typeof value === 'number' ? `${value}deg` : value,
    };
  }
  if (typeof value === 'string') return { property: key, value };
  if (PX_PROPS.has(key)) return { property: key, value: `${value}px` };
  return { property: key, value: String(value) };
};

/** Write a target object to inline styles synchronously. Used for `initial`. */
export const applyTarget = (el: HTMLElement, target: MotionTarget): void => {
  for (const [key, value] of Object.entries(target)) {
    const { property, value: cssValue } = toCss(key, value);
    el.style.setProperty(property, cssValue);
  }
};

/** Animate one property toward a new value via WAAPI, returning the
    underlying Animation so callers can cancel. Honours reduced-motion by
    short-circuiting to a synchronous style write + zero-duration Animation
    so the .finished promise still resolves. */
export const animateProperty = (
  el: HTMLElement,
  key: string,
  value: number | string,
  transition?: ValueTransition,
): Animation => {
  const { property, value: cssValue } = toCss(key, value);
  if (isReducedMotion()) {
    el.style.setProperty(property, cssValue);
    return startWaapiAnimation(el, property, [cssValue] as ValueKeyframesDefinition, {
      duration: 0,
    });
  }
  return startWaapiAnimation(el, property, [cssValue] as ValueKeyframesDefinition, transition);
};

/** Animate every key in `target` from current to new value. Returns an
    array of Animations so the caller can await `.finished` on all of them
    (used by <Presence> to gate exit). */
export const animateTarget = (
  el: HTMLElement,
  target: MotionTarget,
  transition?: ValueTransition,
): Array<Animation> => {
  const animations: Array<Animation> = [];
  for (const [key, value] of Object.entries(target)) {
    animations.push(animateProperty(el, key, value, transition));
  }
  return animations;
};

/** Await every Animation's `.finished` (or `.cancel` rejection). Used by
    <Presence> to delay element removal until the exit animation completes. */
export const awaitAnimations = async (animations: ReadonlyArray<Animation>): Promise<void> => {
  await Promise.all(
    animations.map((a) =>
      a.finished.catch(() => {
        /* cancelled — treat as done */
      }),
    ),
  );
};
