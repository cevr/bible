import { type Accessor, createEffect, createSignal, on, onCleanup } from 'solid-js';

/** Mirrors a source accessor into a derived one whose value lags by
 *  `delayMs` after the source last changed. Empty-string source bypasses
 *  the delay (immediate clear), so search panels collapse their result
 *  list the instant the user clears the input.
 *
 *  Solid's `createEffect(on(...))` + `onCleanup` is the platform-correct
 *  debounce shape — the cleanup hook fires both on dependency change and
 *  on component dispose, so the timer is always cancelled. Wrapped here
 *  so call sites read as "give me a debounced view of this signal" rather
 *  than restating the setTimeout/clearTimeout pair. */
export const createDebouncedSignal = <T>(
  source: Accessor<T>,
  delayMs: number,
  isEmpty: (value: T) => boolean = () => false,
): Accessor<T> => {
  const [value, setValue] = createSignal<T>(source());
  createEffect(
    on(source, (next) => {
      if (isEmpty(next)) {
        setValue(() => next);
        return;
      }
      const timer = window.setTimeout(() => setValue(() => next), delayMs);
      onCleanup(() => {
        window.clearTimeout(timer);
      });
    }),
  );
  return value;
};
