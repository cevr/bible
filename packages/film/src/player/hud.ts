// The Play page's HUD: its controls (the bar, the header and the tab bar)
// shown at rest, and faded while the film plays once no pointer has moved and
// no key or tap has come for `HUD_IDLE_MS`, so the picture is all there is.
// Any input brings them back and starts the wait again; a tap on the picture
// while it plays hides shown controls and shows hidden ones, as a phone's
// players do. Framework-free; its timers are the page host's (`timersOn`),
// or a test's.

import { Option } from 'effect';
import type { Timers } from './throttle.ts';

/**
 * How long the controls stay after the last input while the film plays:
 * 3 s, as YouTube's and AVKit's players wait (players use 2 to 3 s).
 */
export const HUD_IDLE_MS = 3000;

interface Hud {
  /** The film plays (`true`) or stands: standing, the controls show. */
  playing(on: boolean): void;
  /** An input (a pointer moved or pressed, a key): show the controls, and wait again. */
  wake(): void;
  /** A tap on the picture while it plays: hide the controls if shown, else show them. */
  toggle(): void;
  shown(): boolean;
}

/** A HUD that says each change of whether its controls show through `show`, its waits on `timers`. */
export const makeHud = (show: (shown: boolean) => void, timers: Timers): Hud => {
  let shown = true;
  let playing = false;
  let waiting = Option.none<number>();
  const set = (next: boolean) => {
    if (next === shown) return;
    shown = next;
    show(shown);
  };
  const stopWaiting = () => {
    Option.map(waiting, timers.clear);
    waiting = Option.none();
  };
  /** Wait again from now: the controls fade at its end, if the film still plays. */
  const wait = () => {
    stopWaiting();
    if (playing) waiting = Option.some(timers.set(() => set(false), HUD_IDLE_MS));
  };
  const wake = () => {
    set(true);
    wait();
  };
  return {
    playing: (on) => {
      if (on === playing) return;
      playing = on;
      if (playing) wait();
      else {
        stopWaiting();
        set(true);
      }
    },
    wake,
    toggle: () => {
      if (!shown) return wake();
      stopWaiting();
      if (playing) set(false);
    },
    shown: () => shown,
  };
};
