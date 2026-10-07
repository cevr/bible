// The Play page's HUD: its controls (the bar, the header and the tab bar)
// shown at rest, and faded while the film plays once no pointer has moved and
// no key, tap or keyboard focus move has come for `HUD_IDLE_MS`, so the picture is all
// there is. Any input brings them back and starts the wait again; a tap on
// the picture while it plays hides shown controls and shows hidden ones, as
// a phone's players do. While the keyboard's focus is on a control (`held`)
// they never fade, as YouTube's and AVKit's controls stay while they hold
// focus. Faded, they stay in the accessibility tree and the tab order
// (`player.css` fades only their look and their taps), so a keyboard or a
// screen reader reaches play and pause as ever, and the focus landing on one
// brings them back. The focus leaving a control never brings them back
// (`focusLeft`): a tap's meaning never depends on where the focus was.
// Framework-free; its timers are the page host's
// (`timersOn`), or a test's.

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
  /** An input (a pointer moved or pressed, a key, the keyboard's focus landing on a control): show the controls, and wait again. */
  wake(): void;
  /**
   * The focus left a control: shown, the controls wait again from now (a
   * control that held them no longer does); faded, they stay faded. A tap
   * that moves the focus off a control is then the tap's alone: on the
   * picture it shows faded controls, wherever the focus was.
   */
  focusLeft(): void;
  /** A tap on the picture while it plays: hide the controls if shown, else show them. */
  toggle(): void;
  shown(): boolean;
}

/**
 * A HUD that says each change of whether its controls show through `show`,
 * its waits on `timers`; `held` says whether the keyboard's focus is on one
 * of the controls, which keeps them shown.
 */
export const makeHud = (
  show: (shown: boolean) => void,
  timers: Timers,
  held: () => boolean,
): Hud => {
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
  /** Hide the controls, unless the keyboard's focus is on one. */
  const fade = () => {
    if (!held()) set(false);
  };
  /** Wait again from now: the controls fade at its end, if the film still plays. */
  const wait = () => {
    stopWaiting();
    if (playing)
      waiting = Option.some(
        timers.set(() => {
          waiting = Option.none();
          fade();
        }, HUD_IDLE_MS),
      );
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
    focusLeft: () => {
      if (shown) wait();
    },
    toggle: () => {
      if (!shown) return wake();
      stopWaiting();
      if (playing) fade();
    },
    shown: () => shown,
  };
};
