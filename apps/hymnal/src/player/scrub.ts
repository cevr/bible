/**
 * A position bar's drag, shared by each platform's bar. While the reader
 * moves the thumb, the bar shows the move, not the player's position. The
 * move is sent once, when the reader lets go, and only when it ends on
 * another second than the one the bar showed as it began. Once sent, the bar
 * holds the place it was sent to until the player reaches it, or for
 * `settle` if it never does, so the thumb does not jump back to the place
 * before the seek.
 *
 * The web's bar knows the press and the pointer that made it: a move inside
 * a press (`press` to `lift`, or to `drop`) is a drag, and only that
 * pointer ends it. A step the reader asks for at once (a key's, `step`, or a
 * screen reader's, a `move` with no press open) is sent at once, inside a
 * press or not; inside one, the drag goes on from it. iOS's and Android's
 * sliders tell no press: each move is a drag (`change`), let go once it has
 * rested (`useCommitAtRest`).
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
  /** A press by pointer `by` that has not moved the thumb yet. */
  Pressed: { readonly by: number };
  /**
   * A drag, from the place the bar showed as it began (or a key's step in
   * it), to where the thumb is; by a pointer on the web, by none on a bar
   * that tells no press.
   */
  Moving: { readonly by: Option.Option<number>; readonly from: number; readonly to: number };
}>;
const Hand = Data.taggedEnum<Hand>();

/** The pointer that holds the hand, if one does. */
const holder: (hand: Hand) => Option.Option<number> = Hand.$match({
  Free: () => Option.none(),
  Pressed: ({ by }) => Option.some(by),
  Moving: ({ by }) => by,
});

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
        by: holder(now.current),
        from: Hand.$match(now.current, {
          Moving: ({ from }) => from,
          Pressed: () => shown.current,
          Free: () => shown.current,
        }),
        to,
      }),
    );
  /** A step sent at once; a drag under way goes on from it. */
  const step = (to: number) => {
    if (second(to) === second(shown.current)) return;
    send(to);
    const was = now.current;
    if (Hand.$is('Moving')(was)) become(Hand.Moving({ by: was.by, from: to, to }));
  };
  /** Whether pointer `pointer` holds the hand. */
  const holds = (pointer: number) => Option.contains(holder(now.current), pointer);
  /** The hand is let go: a drag that ends on another second is sent. */
  const letGo = () => {
    const was = now.current;
    become(Hand.Free());
    if (Hand.$is('Moving')(was) && second(was.to) !== second(was.from)) send(was.to);
  };
  return {
    value,
    max,
    still: Option.isNone(length),
    dragging: Hand.$is('Moving')(hand),
    /** What a screen reader says of the bar: where it is, of how long. */
    said: `${clock(value)} of ${clock(max)}`,
    /** Pointer `pointer` presses the bar: a move from now until it ends the press is a drag. */
    press: (pointer: number) => {
      if (Hand.$is('Free')(now.current)) become(Hand.Pressed({ by: pointer }));
    },
    /** The bar's value moved with no key: a drag inside a press, else a step sent at once. */
    move: (to: number) => {
      if (Hand.$is('Free')(now.current)) step(to);
      else drag(to);
    },
    /** A key stepped the bar's value: sent at once, inside a press or not. */
    step,
    /** Pointer `pointer` lets go: its press ends, and its drag is sent if it moved. */
    lift: (pointer: number) => {
      if (holds(pointer)) letGo();
    },
    /** Pointer `pointer`'s press is taken from the bar (a scroll, a lost capture): its drag is dropped, unsent. */
    drop: (pointer: number) => {
      if (holds(pointer)) become(Hand.Free());
    },
    /** The value moved on a bar that tells no press: a drag, until `release`. */
    change: drag,
    /** The drag on a bar that tells no press has rested: sent if it moved. */
    release: () => {
      if (Hand.$is('Moving')(now.current)) letGo();
    },
  };
};
