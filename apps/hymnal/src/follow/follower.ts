/**
 * The follow on one hymn page: it hears the player's reports, runs the
 * clock between them (`clock.ts`), marks the sung line and word (`marks.ts`)
 * and asks the page to scroll a line into view.
 *
 * It wakes only when something changes: at each report, and at the next
 * syllable's start or the next line's lead while the player plays. The page
 * scrolls only while the player plays. It moves to a line `LEAD` ms before
 * the line is sung, so the line is in view when it starts. A seek (a report
 * further than `SLACK` from the running clock) moves the marks at once and
 * scrolls to the line sung there.
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

export const followerOf = (timeline: Timeline, host: Host) => {
  const marks = marksOf();
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
    if ((playing || snap) && target >= 0 && target !== shown) {
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
    if (told._tag === 'Away') {
      if (Option.isNone(clock)) return;
      clock = Option.none();
      shown = -1;
      marks.set(-1, -1);
      host.log('end');
      tick();
      return;
    }
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
    tick();
  };

  return {
    marks,
    report,
    /** The page's lines moved (chords, text size, a turn): scroll the shown line back into place. */
    relayout: () => {
      if (Option.isSome(clock) && clock.value.playing && shown >= 0) host.scrollTo(shown, false);
    },
    /** The page is gone: stop waking. */
    stop: () => {
      cancel();
      cancel = () => {};
    },
  };
};
export type Follower = ReturnType<typeof followerOf>;
