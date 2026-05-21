/* Solid-facing MotionValue API.

   Three shapes:
   - `useMotionValue(initial)` — create an MV scoped to the component (no
     cleanup yet; MVs are GC'd with the component, and `.destroy()` only
     matters when you attach long-lived followers).
   - `useTransform(source, fn)` — derived MV. Re-evaluates whenever any
     source MV emits 'change'. Returns an MV so it composes with <Motion>.
   - `useSpring(source, opts)` — spring-followed MV. Wraps motion-dom's
     `springValue` (which already handles attachment + cleanup of its
     internal animation when the source changes). */
import { motionValue, springValue, type MotionValue, type SpringOptions } from 'motion-dom';
import { createEffect, onCleanup } from 'solid-js';

export const useMotionValue = <T>(initial: T): MotionValue<T> => {
  const mv = motionValue(initial);
  onCleanup(() => mv.destroy());
  return mv;
};

type TransformSource = MotionValue<unknown> | Array<MotionValue<unknown>>;

export function useTransform<U>(
  source: MotionValue<unknown>,
  fn: (v: unknown) => U,
): MotionValue<U>;
export function useTransform<U>(
  source: Array<MotionValue<unknown>>,
  fn: (...values: ReadonlyArray<unknown>) => U,
): MotionValue<U>;
export function useTransform<U>(
  source: TransformSource,
  fn: ((v: unknown) => U) | ((...values: ReadonlyArray<unknown>) => U),
): MotionValue<U> {
  const sources = Array.isArray(source) ? source : [source];
  const compute = (): U => {
    const values = sources.map((mv) => mv.get());
    return Array.isArray(source)
      ? (fn as (...v: ReadonlyArray<unknown>) => U)(...values)
      : (fn as (v: unknown) => U)(values[0]);
  };
  const out = motionValue(compute());
  for (const mv of sources) {
    onCleanup(mv.on('change', () => out.set(compute())));
  }
  onCleanup(() => out.destroy());
  return out;
}

/* Spring that tracks either a plain number or another MV. When the source is
   an MV, springValue() attaches a follower internally — its returned destroy
   handles the unsubscribe. */
export const useSpring = (
  source: number | MotionValue<number>,
  opts?: SpringOptions,
): MotionValue<number> => {
  const out = springValue(source, opts);
  onCleanup(() => out.destroy());
  return out;
};

/* Push a Solid accessor's value into an MV. Useful when an MV is the
   animation target but the source is a regular signal (e.g. width derived
   from `drawer() === 'tocPlusLib'`). */
export const syncSignalToMotionValue = <T>(mv: MotionValue<T>, read: () => T): void => {
  createEffect(() => mv.set(read()));
};
