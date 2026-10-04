// How a read or a write in flight reads on the review's pages: a read's value
// once it has one (else what it waits on, or why it failed), and a write's
// receipt. Every page says these the same way. Every write a review page
// sends goes through `useWrite`: each control (a verb, a knob, a say, Undo)
// owns its run, so a write sent while another is in flight neither cancels
// it nor takes its answer, and a control waits (refusing another write)
// until its own answer lands. Its answer lands as `Landed` (`asked.ts`),
// shown only where no write asked after it has been shown. Its receipt, in
// the words its control gave as it was sent (what it moves, before →
// after), is said on the page's hub in the page's slot: busy while it is
// out, then what it did (with the command that undoes it) or why it was
// refused (with the command its words offer past the refusal: Accept
// anyway), for the newest asked of those landed (`writeStatus`).

import { useAtomMount, useAtomSet } from '@bible/atom-solid';
import { type JSX, Show } from '@solidjs/web';
import { Effect, Exit, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { type Accessor, createSignal, untrack } from 'solid-js';
import { busy, refused, said } from '../../command/command.ts';
import type { LabFailure } from '../api.ts';
import type { ReviewApi } from './api.ts';
import { type Asks, type Landed, newestAsked, sending } from './asked.ts';
import { useReview } from './context.tsx';
import { type Words, failedText } from './format.ts';
import type { OptionsApi } from './options/api.ts';

/** A page's writes, each said as a receipt in the page's slot. */
export interface WriteStatus<A> {
  /**
   * Count a write in, asked now, said in `words`: busy until `answer` lands,
   * then said unless a write asked after it has landed already (`asked.ts`).
   */
  readonly track: (
    answer: Promise<Exit.Exit<A, LabFailure>>,
    words: Words<A>,
  ) => Promise<Exit.Exit<A, LabFailure>>;
}

/** A page's receipts over its writes, in `slot` on the page's hub. */
export const writeStatus = <A,>(slot: string): WriteStatus<A> => {
  const { meta } = useReview();
  const asks = newestAsked();
  return {
    track: (answer, words) => {
      const ask = asks.ask();
      meta.hub.announce(busy(words.doing), slot);
      return answer.then((exit) => {
        ask.answer(() =>
          meta.hub.announce(
            Exit.match(exit, {
              onSuccess: (a) =>
                said(
                  words.done(a),
                  words.undo,
                  // Bound to the change it made, so its Undo steps that one, on its film.
                  Option.flatMap(Option.fromUndefinedOr(words.bound), (bound) => bound(a)),
                ),
              onFailure: () =>
                refused(
                  failedText(AsyncResult.fromExit(exit)),
                  // The way past it its words offer for this refusal (Accept anyway), if any.
                  Option.flatMap(Exit.findErrorOption(exit), (failure) =>
                    Option.flatMap(Option.fromUndefinedOr(words.past), (past) => past(failure)),
                  ),
                ),
            }),
            slot,
          ),
        );
        return exit;
      });
    },
  };
};

/** One control's write: whether its own is in flight, and the write. */
interface OwnWrite<Arg, A, K extends string> {
  readonly waiting: Accessor<boolean>;
  /**
   * Write `arg`: its answer as it landed, ordered by each of the page's
   * `orders` (`Landed`); none, sending nothing, while this control's last is
   * in flight.
   */
  readonly write: (arg: Arg) => Promise<Option.Option<Landed<A, LabFailure, K>>>;
}

/**
 * A control's own write, run on the page's runtime and said on `status` in
 * the words `words` gives for its argument as it is sent. Its answer is
 * shown only through the asks of `orders` taken as it is sent (`asked.ts`):
 * the one way a write's answer reaches a page's state. Called once, as the
 * control is made: each call is a run of its own.
 */
export const useWrite = <Arg, A, K extends string>(
  run: (arg: Arg) => Effect.Effect<A, LabFailure, ReviewApi | OptionsApi>,
  status: WriteStatus<A>,
  orders: Readonly<Record<K, Asks>>,
  words: (arg: Arg) => Words<A>,
): OwnWrite<Arg, A, K> => {
  const { meta } = useReview();
  const atom = meta.runtime.fn<Arg>()(run);
  // Mounted while the control lives, so its run is never dropped for want of a reader.
  useAtomMount(() => atom);
  const set = useAtomSet(() => atom, { mode: 'promiseExit' });
  const [waiting, setWaiting] = createSignal(false);
  return {
    waiting,
    write: (arg) => {
      if (untrack(waiting)) return Effect.runPromise(Effect.succeedNone);
      setWaiting(true);
      const land = sending(orders);
      return status.track(set(arg), words(arg)).then((exit) => {
        setWaiting(false);
        return Option.some(land(exit));
      });
    },
  };
};

/**
 * `children` over `value` once there is one, kept in place as it changes
 * (the value is an accessor); before, what `result` is `reading`, or why it
 * failed.
 */
export const Loaded = <A,>(props: {
  readonly value: Option.Option<A>;
  readonly result: AsyncResult.AsyncResult<unknown, LabFailure>;
  readonly reading: string;
  readonly children: (value: Accessor<A>) => JSX.Element;
}) => (
  <Show
    when={Option.getOrUndefined(props.value)}
    fallback={
      <p class="empty">
        {Match.value(AsyncResult.isFailure(props.result)).pipe(
          Match.when(true, () => failedText(props.result)),
          Match.orElse(() => props.reading),
        )}
      </p>
    }
  >
    {(value: Accessor<A>) => props.children(value)}
  </Show>
);
