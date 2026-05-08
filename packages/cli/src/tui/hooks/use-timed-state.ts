/**
 * Timed State Hook
 *
 * Creates a signal that automatically resets to a default value after a delay.
 * Handles cleanup on unmount to prevent memory leaks.
 */

import { createSignal, onCleanup, type Accessor } from 'solid-js';

/**
 * Creates a signal that resets to a default value after a delay.
 *
 * @param initialValue - The initial value of the signal
 * @param resetValue - The value to reset to after the delay
 * @param delayMs - The delay in milliseconds before resetting
 * @returns A tuple of [accessor, setter] where setter triggers the timed reset
 *
 * @example
 * ```tsx
 * const [highlight, setHighlight] = createTimedSignal<number | null>(null, null, 2000);
 * // Setting a value will auto-clear after 2 seconds
 * setHighlight(5);
 * ```
 */
export function createTimedSignal<T>(
  initialValue: T,
  resetValue: T,
  delayMs: number,
): [Accessor<T>, (value: T) => void] {
  const [value, setValue] = createSignal<T>(initialValue);
  let timeoutId: Timer | undefined;

  const setWithTimeout = (newValue: T) => {
    if (timeoutId) clearTimeout(timeoutId);
    setValue(() => newValue);
    timeoutId = setTimeout(() => setValue(() => resetValue), delayMs);
  };

  onCleanup(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });

  return [value, setWithTimeout];
}
