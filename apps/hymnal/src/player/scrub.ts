/**
 * A position bar's drag, shared by each platform's bar. While the reader
 * moves the thumb, the bar shows the move, not the player's position. The
 * move is sent once, when the reader lets go, and only when it ends on
 * another second than the one the bar showed as it began. Once sent, the bar
 * holds the place it was sent to until the player reaches it, or for
 * `settle` if it never does, so the thumb does not jump back to the place
 * before the seek.
 *
 * The web's bar knows the press: a move inside one (`press` to `release`, or
 * to `cancel`) is a drag, and a move outside one (a key, a screen reader) is
 * a step, sent at once. iOS's and Android's sliders tell no press: each move
 * is a drag (`change`), let go once it has rested (`useCommitAtRest`).
 */

import { Data, Duration, Effect, Fiber, Option } from 'effect';
import { useEffect, useRef, useState } from 'react';

import { clock } from './time';

export interface ScrubberProps {
  /** The player's position, in seconds. */
  readonly at: number;
  /** The recording's length in seconds; none while unknown, and the bar is then still. */
  readonly length: Option.Option<number>;
  readonly onSeek: (seconds: number) => void;
}

/** The reader's hand on the bar. */
type Hand = Data.TaggedEnum<{
  /** No press: the bar draws playback, or the place it sent. */
  Free: {};
  /** A press that has not moved the thumb yet. */
  Pressed: {};
  /** A drag, from the place the bar showed as it began, to where the thumb is. */
  Moving: { readonly from: number; readonly to: number };
}>;
const Hand = Data.taggedEnum<Hand>();

/**
 * For a bar that tells each value as the reader drags but not the drag's
 * end (SwiftUI's and Material's sliders): the drag is let go once it has
 * rested for `rest`.
 */
export const useCommitAtRest = (scrub: ReturnType<typeof useScrub>, rest: Duration.Input) =>
  useEffect(() => {
    if (!scrub.dragging) return;
    const resting = Effect.runFork(
      Effect.sleep(rest).pipe(Effect.andThen(Effect.sync(scrub.release))),
    );
    return () => {
      Effect.runFork(Fiber.interrupt(resting));
    };
  }, [scrub.dragging, scrub.value]);

/** How long the bar holds a place it sent before it shows the player's again. */
const settleFor = Duration.seconds(2);

/** Whether the player at `at` has reached the place `sent`: within a second of it. */
const reached = (at: number, sent: number) => Math.abs(at - sent) < 1;

/** The second a place falls in: the bar moves a second a step. */
const second = Math.floor;

export const useScrub = (
  { at, length, onSeek }: ScrubberProps,
  settle: Duration.Input = settleFor,
) => {
  const [hand, setHand] = useState<Hand>(Hand.Free());
  // The hand as the last event left it: events that come before the bar draws
  // again (a press, its move and its release in one batch) read this.
  const now = useRef(hand);
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
  const value = Hand.$match(hand, {
    Moving: ({ to }) => to,
    Pressed: () => Option.getOrElse(sent, () => Math.min(Math.max(at, 0), max)),
    Free: () => Option.getOrElse(sent, () => Math.min(Math.max(at, 0), max)),
  });
  const shown = useRef(value);
  shown.current = value;

  const become = (next: Hand) => {
    now.current = next;
    setHand(next);
  };
  /** Seek to `to`, and hold its place until the player reaches it. */
  const send = (to: number) => {
    onSeek(to);
    setSent(Option.some(to));
  };
  /** The thumb is at `to`, dragged from where the bar showed as the drag began. */
  const drag = (to: number) =>
    become(
      Hand.Moving({
        from: Hand.$match(now.current, {
          Moving: ({ from }) => from,
          Pressed: () => shown.current,
          Free: () => shown.current,
        }),
        to,
      }),
    );
  return {
    value,
    max,
    still: Option.isNone(length),
    dragging: Hand.$is('Moving')(hand),
    /** What a screen reader says of the bar: where it is, of how long. */
    said: `${clock(value)} of ${clock(max)}`,
    /** The reader presses the bar: a move from now until the press ends is a drag. */
    press: () => {
      if (Hand.$is('Free')(now.current)) become(Hand.Pressed());
    },
    /** The bar's value moved: a drag inside a press, else a step sent at once. */
    move: (to: number) => {
      if (!Hand.$is('Free')(now.current)) return drag(to);
      if (second(to) !== second(shown.current)) send(to);
    },
    /** The value moved on a bar that tells no press: a drag, until `release`. */
    change: drag,
    /** The press ends: a drag that ends on another second is sent. */
    release: () => {
      const was = now.current;
      if (Hand.$is('Free')(was)) return;
      become(Hand.Free());
      if (Hand.$is('Moving')(was) && second(was.to) !== second(was.from)) send(was.to);
    },
    /** The press is taken from the bar (a scroll, a lost pointer): its drag is dropped, unsent. */
    cancel: () => {
      if (!Hand.$is('Free')(now.current)) become(Hand.Free());
    },
  };
};
