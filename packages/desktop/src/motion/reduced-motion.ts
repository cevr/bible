/* Reactive `prefers-reduced-motion` signal. motion-dom exposes a mutable
   `{ current }` ref kept up-to-date by a media-query listener; we shadow it
   with a Solid signal so JSX/components can react to changes. */
import { initPrefersReducedMotion, prefersReducedMotion } from 'motion-dom';
import { createSignal, onCleanup, onMount, type Accessor } from 'solid-js';

let booted = false;
const ensureListener = (): void => {
  if (booted) return;
  initPrefersReducedMotion();
  booted = true;
};

export const useReducedMotion = (): Accessor<boolean> => {
  const [get, set] = createSignal(prefersReducedMotion.current === true);

  onMount(() => {
    ensureListener();
    set(prefersReducedMotion.current === true);
    /* motion-dom doesn't expose an observable for prefersReducedMotion; the
       MQ listener flips the ref. We re-read on a microtask after mount and
       poll via the global matchMedia event so the signal stays accurate. */
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent): void => {
      set(e.matches);
    };
    mq.addEventListener('change', handler);
    onCleanup(() => mq.removeEventListener('change', handler));
  });

  return get;
};

/** Module-level read for non-component code paths (e.g. the <Motion> driver
    deciding whether to .jump() instead of animating). */
export const isReducedMotion = (): boolean => {
  ensureListener();
  return prefersReducedMotion.current === true;
};
