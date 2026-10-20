/**
 * A position bar's drag, shared by each platform's bar: while the reader
 * drags, the bar shows the drag, not the player's position, and the drag
 * is sent to the player once (`commit`). Once sent, the bar holds the place
 * it was sent to until the player reaches it, or for `settle` if it never
 * does, so the thumb does not jump back to the place before the seek.
 */

import { Duration, Effect, Fiber, Option } from 'effect';
import { useEffect, useState } from 'react';

import { clock } from './time';

export interface ScrubberProps {
  /** The player's position, in seconds. */
  readonly at: number;
  /** The recording's length in seconds; none while unknown, and the bar is then still. */
  readonly length: Option.Option<number>;
  readonly onSeek: (seconds: number) => void;
}

/**
 * For a bar that tells each value as the reader drags but not the drag's
 * end (SwiftUI's and Material's sliders): the drag is sent once it has
 * rested for `rest`.
 */
export const useCommitAtRest = (scrub: ReturnType<typeof useScrub>, rest: Duration.Input) =>
  useEffect(() => {
    if (!scrub.dragging) return;
    const resting = Effect.runFork(
      Effect.sleep(rest).pipe(Effect.andThen(Effect.sync(scrub.commit))),
    );
    return () => {
      Effect.runFork(Fiber.interrupt(resting));
    };
  }, [scrub.dragging, scrub.value]);

/** How long the bar holds a place it sent before it shows the player's again. */
const settle = Duration.seconds(2);

/** Whether the player at `at` has reached the place `sent`: within a second of it. */
const reached = (at: number, sent: number) => Math.abs(at - sent) < 1;

export const useScrub = ({ at, length, onSeek }: ScrubberProps) => {
  const [drag, setDrag] = useState(Option.none<number>());
  const [sent, setSent] = useState(Option.none<number>());
  useEffect(() => {
    if (Option.exists(sent, (to) => reached(at, to))) setSent(Option.none());
  }, [at, sent]);
  useEffect(() => {
    if (Option.isNone(sent)) return;
    const waiting = Effect.runFork(
      Effect.sleep(settle).pipe(Effect.andThen(Effect.sync(() => setSent(Option.none())))),
    );
    return () => {
      Effect.runFork(Fiber.interrupt(waiting));
    };
  }, [sent]);
  const max = Option.getOrElse(length, () => 0);
  const value = Option.getOrElse(
    Option.orElse(drag, () => sent),
    () => Math.min(Math.max(at, 0), max),
  );
  return {
    value,
    max,
    still: Option.isNone(length),
    dragging: Option.isSome(drag),
    /** What a screen reader says of the bar: where it is, of how long. */
    said: `${clock(value)} of ${clock(max)}`,
    change: (seconds: number) => setDrag(Option.some(seconds)),
    /** Send the drag, if there is one, and hold its place until the player reaches it. */
    commit: () => {
      Option.map(drag, onSeek);
      setSent(Option.orElse(drag, () => sent));
      setDrag(Option.none());
    },
    /** Drop the drag unsent: the gesture was taken from the bar. */
    cancel: () => setDrag(Option.none()),
  };
};
