/**
 * The follow's clock: where the player is now, between its polls.
 *
 * The player reports its place (`at`) every 250 ms. Between reports the
 * clock runs on from the last one while the player plays, and holds while it
 * does not, so the marks move with the singing and not in 250 ms steps. A
 * report close to where the clock has run (within `SLACK`) moves it on, never
 * back, so the marks do not flicker back over a word; a seek, or a report
 * further off, sets it to the report.
 */

/** How far a report may sit from the running clock and still be taken as the same place. */
export const SLACK = 250;

export interface Clock {
  /** The place, in ms, at `stamp`. */
  readonly at: number;
  /** When `at` was read, in ms of the host's clock. */
  readonly stamp: number;
  readonly playing: boolean;
}

/** A clock set at `at`, read at `now`. */
export const clockAt = (at: number, playing: boolean, now: number): Clock => ({
  at,
  stamp: now,
  playing,
});

/** The place at `now`: run on from the last report while playing, held while not. */
export const placeOf = (clock: Clock, now: number): number =>
  clock.at + Number(clock.playing) * Math.max(0, now - clock.stamp);

/** A report from the player.  `seek` is true when the reader moved the place. */
export interface Report {
  readonly at: number;
  readonly playing: boolean;
  readonly seek: boolean;
}

/** The clock after a report read at `now`. */
export const observe = (clock: Clock, report: Report, now: number): Clock => {
  const running = placeOf(clock, now);
  if (report.seek || Math.abs(report.at - running) > SLACK)
    return clockAt(report.at, report.playing, now);
  return clockAt(Math.max(report.at, running), report.playing, now);
};
