/* MotionValue ↔ Solid signal bridges.

   `motion-dom`'s MotionValue is reactive but external to Solid's tracking
   graph. These helpers make MVs feel like signals where it matters
   (rendering, derived values) while keeping the underlying MV for the fast
   per-frame path used by <Motion> (direct style writes, no JSX re-render). */
import { motionValue, type MotionValue } from 'motion-dom';
import { createSignal, onCleanup, type Accessor } from 'solid-js';

/** Track an MV as a Solid signal — re-renders any JSX that reads it. */
export const mvSignal = <T>(mv: MotionValue<T>): Accessor<T> => {
  const [get, set] = createSignal(mv.get(), { equals: false });
  onCleanup(mv.on('change', set as (v: T) => void));
  return get;
};

/** Convenience: motionValue() typed without leaking the package import to
    callers that just want a fresh MV. */
export const newMotionValue = <T>(initial: T): MotionValue<T> => motionValue(initial);
