import { onCleanup } from 'solid-js';

/** Schedule a side-effecting action to fire after `delayMs` of quiet, with
 *  explicit `flush()` and `cancel()` controls. Solid's `onCleanup` is bound
 *  on creation so the pending timer is cancelled on component dispose —
 *  call sites stop tracking `setTimeout`/`clearTimeout` themselves and read
 *  as "schedule this action; here's how to flush early".
 *
 *  Example: scroll-spy persistence — debounce 250 ms during continuous
 *  scroll, but flush immediately on chapter swap (the chapter we're leaving
 *  would otherwise lose its latest position write) and on `beforeunload`. */
export interface DebouncedAction<T> {
  /** Replace any pending payload with `value` and (re)start the delay. */
  readonly schedule: (value: T) => void;
  /** Fire the pending action now if any; no-op otherwise. */
  readonly flush: () => void;
  /** Drop the pending action without firing. */
  readonly cancel: () => void;
}

export const createDebouncedAction = <T>(
  run: (value: T) => void,
  delayMs: number,
): DebouncedAction<T> => {
  type Pending =
    | { readonly _tag: 'idle' }
    | { readonly _tag: 'scheduled'; readonly value: T; readonly timerId: number };
  let state: Pending = { _tag: 'idle' };

  const cancel = (): void => {
    if (state._tag === 'idle') return;
    window.clearTimeout(state.timerId);
    state = { _tag: 'idle' };
  };
  const flush = (): void => {
    if (state._tag === 'idle') return;
    const { value, timerId } = state;
    window.clearTimeout(timerId);
    state = { _tag: 'idle' };
    run(value);
  };
  const schedule = (value: T): void => {
    if (state._tag === 'scheduled') window.clearTimeout(state.timerId);
    const timerId = window.setTimeout(() => {
      state = { _tag: 'idle' };
      run(value);
    }, delayMs);
    state = { _tag: 'scheduled', value, timerId };
  };

  onCleanup(flush);
  return { schedule, flush, cancel };
};
