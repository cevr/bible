/**
 * The follow on one hymn page: it hears the player's reports, runs the
 * clock between them (`clock.ts`), marks the sung line and word (`marks.ts`)
 * and asks the page to scroll a line into view.
 *
 * It wakes only when something changes: at each report, and at the next
 * syllable's start or the next line's lead while the player plays. The page
 * scrolls only while the player plays. It moves to a line `LEAD` ms before
 * the line is sung, so the line is in view when it starts. A seek (one the
 * reader asks, of any size, or a report further than `SLACK` from the running
 * clock) moves the marks at once and scrolls to the line sung there.
 *
 * A hand scroll (`drag`) while the player is on the hymn and not paused holds
 * the page's scroll, not the marks: the page shows a pill (`held`) until the
 * reader taps it (`resume`, which scrolls to the line sung now), seeks, or
 * the player pauses or leaves the hymn.
 *
 * The host gives it the time, its timers, the scroll and the dev log, so a
 * test drives it with a hand-moved clock.
 */

import { Option } from 'effect';

import { type Clock, clockAt, observe, placeOf, SLACK } from './clock';
import { marksOf } from './marks';
import { placeAt, type Timeline } from './timeline';

/** How long before a line is sung the page scrolls to it: about one beat. */
export const LEAD = 600;

/** What the player tells the page, read from its state. */
export type Report =
  /** The player is not on this hymn, or has stopped or ended. */
  | { readonly _tag: 'Away' }
  /** The player is on this hymn at `at` ms: playing, waiting on the network, or paused. */
  | {
      readonly _tag: 'Here';
      readonly at: number;
      readonly state: 'playing' | 'waiting' | 'paused';
    };

export interface Host {
  /** The host's clock, in ms. */
  readonly now: () => number;
  /** Runs `run` in `ms`; the returned function cancels it. */
  readonly wake: (ms: number, run: () => void) => () => void;
  /** Scrolls the page so `line` sits a third of the way down it. */
  readonly scrollTo: (line: number, animated: boolean) => void;
  /** One dev log event, after `[follow] `. */
  readonly log: (event: string) => void;
}

/** Whether a hand scroll holds the page's scroll: the flag the page's pill reads. */
export interface Held {
  readonly get: () => boolean;
  /** Calls `listener` whenever the flag changes. */
  readonly subscribe: (listener: () => void) => () => void;
}

const heldOf = () => {
  let held = false;
  const listeners = new Set<() => void>();
  return {
    get: () => held,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (to: boolean) => {
      if (to === held) return;
      held = to;
      listeners.forEach((listener) => listener());
    },
  };
};

export const followerOf = (timeline: Timeline, host: Host) => {
  const marks = marksOf();
  const held = heldOf();
  /** The player's last report on this hymn. */
  let last: Report = { _tag: 'Away' };
  let clock: Option.Option<Clock> = Option.none();
  /** The line the page last scrolled to, `-1` for none. */
  let shown = -1;
  /** Whether the next tick scrolls to the line sung now, not the one ahead: after a seek. */
  let snap = false;
  let cancel = () => {};

  const tick = () => {
    cancel();
    cancel = () => {};
    if (Option.isNone(clock)) return;
    const { playing } = clock.value;
    const now = host.now();
    const at = placeOf(clock.value, now);
    const place = placeAt(timeline, at);
    if (place.line !== marks.line() && place.line >= 0)
      host.log(`line i=${place.line} of=${timeline.lines.length} at=${Math.round(at)}`);
    marks.set(place.line, place.word);
    const ahead = placeAt(timeline, at + LEAD);
    // A seek shows the line sung now; playing on shows the next line LEAD ms early.
    let target = ahead.line;
    if (snap) target = place.line;
    if ((playing || snap) && !held.get() && target >= 0 && target !== shown) {
      shown = target;
      host.scrollTo(target, true);
    }
    snap = false;
    if (!playing) return;
    const next = Math.min(place.nextAt, ahead.nextAt - LEAD);
    if (Number.isFinite(next)) cancel = host.wake(Math.max(0, next - at), tick);
  };

  const report = (told: Report) => {
    const now = host.now();
    last = told;
    if (told._tag === 'Away') {
      held.set(false);
      if (Option.isNone(clock)) return;
      clock = Option.none();
      shown = -1;
      marks.set(-1, -1);
      host.log('end');
      tick();
      return;
    }
    if (told.state === 'paused') held.set(false);
    const playing = told.state === 'playing';
    clock = Option.some(
      Option.match(clock, {
        onNone: () => clockAt(told.at, playing, now),
        onSome: (was) => {
          if (Math.abs(told.at - placeOf(was, now)) > SLACK) snap = true;
          return observe(was, { at: told.at, playing, seek: false }, now);
        },
      }),
    );
    // A report this far off is a seek too, as when the lock screen moved the place.
    if (snap) release();
    tick();
  };

  /** A seek ends a hand pause: the next tick scrolls to the line sung there, even the one shown before the drag. */
  const release = () => {
    if (!held.get()) return;
    held.set(false);
    shown = -1;
    host.log('resume reason=seek');
  };

  return {
    marks,
    report,
    held: { get: held.get, subscribe: held.subscribe } satisfies Held,
    /** A hand scroll began: hold the page's scroll while the player is on the hymn and not paused. */
    drag: () => {
      if (last._tag === 'Away' || last.state === 'paused' || held.get()) return;
      held.set(true);
      host.log('pause reason=drag');
    },
    /**
     * The reader asked the player for a place (`seeks.ts`): a seek of any size, even one inside
     * the clock's slack, ends a hand pause, and the next report scrolls to the line sung there.
     */
    seek: () => {
      snap = true;
      release();
    },
    /** The pill was tapped: scroll to the line sung now and follow again. */
    resume: () => {
      if (!held.get()) return;
      held.set(false);
      host.log('resume reason=pill');
      if (Option.isNone(clock)) return;
      const line = placeAt(timeline, placeOf(clock.value, host.now())).line;
      if (line < 0) return;
      shown = line;
      host.scrollTo(line, true);
    },
    /** The page's lines moved (chords, text size, a turn): scroll the shown line back into place. */
    relayout: () => {
      if (Option.isSome(clock) && clock.value.playing && !held.get() && shown >= 0)
        host.scrollTo(shown, false);
    },
    /** The page is gone: stop waking. */
    stop: () => {
      cancel();
      cancel = () => {};
    },
  };
};
export type Follower = ReturnType<typeof followerOf>;
