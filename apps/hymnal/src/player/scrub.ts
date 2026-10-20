/**
 * A position bar's drag, shared by each platform's bar: while the reader
 * drags, the bar shows the drag, not the player's position, and the drag
 * is sent to the player once (`commit`).
 */

import { type Duration, Effect, Fiber, Option } from 'effect';
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

export const useScrub = ({ at, length, onSeek }: ScrubberProps) => {
  const [drag, setDrag] = useState(Option.none<number>());
  const max = Option.getOrElse(length, () => 0);
  const value = Option.getOrElse(drag, () => Math.min(Math.max(at, 0), max));
  return {
    value,
    max,
    still: Option.isNone(length),
    dragging: Option.isSome(drag),
    /** What a screen reader says of the bar: where it is, of how long. */
    said: `${clock(value)} of ${clock(max)}`,
    change: (seconds: number) => setDrag(Option.some(seconds)),
    commit: () => {
      Option.map(drag, onSeek);
      setDrag(Option.none());
    },
  };
};
