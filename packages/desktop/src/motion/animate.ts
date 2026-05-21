/* Thin Solid-facing wrappers around motion-dom's two animation entry points.

   - `animateValue` drives a MotionValue<number|string> toward keyframes via
     the JS engine. Use when the value isn't a transform/opacity (e.g.
     scrollTop, animated SVG path data) or when you want explicit control.
   - `animate` drives one or more DOM elements directly. motion-dom auto-
     picks WAAPI for accelerated properties (transform/opacity/filter), JS
     otherwise. This is what <Motion> uses under the hood.

   Both return AnimationPlaybackControls so callers can stop/cancel from
   onCleanup. */
import {
  animateSingleValue,
  startWaapiAnimation,
  type AnimationPlaybackControlsWithThen,
  type MotionValue,
  type UnresolvedValueKeyframe,
  type ValueAnimationTransition,
  type ValueKeyframesDefinition,
  type ValueTransition,
} from 'motion-dom';

/** Animate a MotionValue toward `keyframes`. Returns playback controls
    (stop/cancel/then) — call `.stop()` in onCleanup if the animation is
    tied to a component. */
export const animateValue = <V extends number | string>(
  mv: MotionValue<V>,
  keyframes: V | Array<UnresolvedValueKeyframe<V>>,
  options?: ValueAnimationTransition,
): AnimationPlaybackControlsWithThen => animateSingleValue(mv, keyframes, options);

/** Animate a single style property on an Element via WAAPI. For
    transform/opacity this hands off to a compositor-driven Animation that
    runs off the main thread; the returned Animation has the usual WAAPI
    `.cancel()` / `.finish()` controls. */
export const animateStyle = (
  element: Element,
  valueName: string,
  keyframes: ValueKeyframesDefinition,
  options?: ValueTransition,
): Animation => startWaapiAnimation(element, valueName, keyframes, options);
