// How a read or a write in flight reads on the review's pages: a read's value
// once it has one (else what it waits on, or why it failed), and a write's
// status line. Every page says these the same way. Every write a review page
// sends goes through `useWrite`: each control (a verb, a knob, a say, Undo)
// owns its run, so a write sent while another is in flight neither cancels
// it nor takes its answer, and a control waits (refusing another write)
// until its own answer lands. The status line counts them all
// (`writeStatus`).

import { useAtomMount, useAtomSet } from '@bible/atom-solid';
import { type JSX, Show } from '@solidjs/web';
import { Effect, type Exit, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { type Accessor, createMemo, createSignal, untrack } from 'solid-js';
import type { LabFailure } from '../api.ts';
import type { ReviewApi } from './api.ts';
import { useReview } from './context.tsx';
import type { OptionsApi } from './options/api.ts';

/** What a failed read or write says: its words, without its tag. */
export const failedText = (result: AsyncResult.AsyncResult<unknown, LabFailure>): string =>
  Option.getOrElse(
    Option.map(AsyncResult.error(result), (e) => e.message.replace(/^\w+: /, '')),
    () => '',
  );

/** A write's status: `waiting` while it runs, what it did, why it failed, or nothing before it. */
export const statusText = <A,>(
  result: AsyncResult.AsyncResult<A, LabFailure>,
  waiting: string,
  done: (value: A) => string,
): string =>
  Match.value(result).pipe(
    Match.when(
      (r) => r.waiting,
      () => waiting,
    ),
    Match.orElse((r) =>
      AsyncResult.match(r, {
        onInitial: () => '',
        onSuccess: (s) => done(s.value),
        onFailure: () => failedText(r),
      }),
    ),
  );

/** A page's writes as its one status line says them: waiting while any is in flight, else the last to land. */
export interface WriteStatus<A> {
  readonly status: Accessor<AsyncResult.AsyncResult<A, LabFailure>>;
  /** Count a write in: in flight until `answer` lands, then the last landed. */
  readonly track: (answer: Promise<Exit.Exit<A, LabFailure>>) => Promise<Exit.Exit<A, LabFailure>>;
}

/** A page's status line over its writes: none written yet. */
export const writeStatus = <A,>(): WriteStatus<A> => {
  const [inFlight, setInFlight] = createSignal(0);
  const [last, setLast] = createSignal<AsyncResult.AsyncResult<A, LabFailure>>(
    AsyncResult.initial(),
  );
  return {
    status: createMemo(() => {
      if (inFlight() > 0) return AsyncResult.waiting(last());
      return last();
    }),
    track: (answer) => {
      setInFlight((n) => n + 1);
      return answer.then((exit) => {
        setLast(AsyncResult.fromExit(exit));
        setInFlight((n) => n - 1);
        return exit;
      });
    },
  };
};

/** One control's write: whether its own is in flight, and the write. */
interface OwnWrite<Arg, A> {
  readonly waiting: Accessor<boolean>;
  /** Write `arg`: its own answer; an interrupt, sending nothing, while this control's last is in flight. */
  readonly write: (arg: Arg) => Promise<Exit.Exit<A, LabFailure>>;
}

/**
 * A control's own write, run on the page's runtime and counted on `status`.
 * Called once, as the control is made: each call is a run of its own.
 */
export const useWrite = <Arg, A>(
  run: (arg: Arg) => Effect.Effect<A, LabFailure, ReviewApi | OptionsApi>,
  status: WriteStatus<A>,
): OwnWrite<Arg, A> => {
  const { meta } = useReview();
  const atom = meta.runtime.fn<Arg>()(run);
  // Mounted while the control lives, so its run is never dropped for want of a reader.
  useAtomMount(() => atom);
  const set = useAtomSet(() => atom, { mode: 'promiseExit' });
  const [waiting, setWaiting] = createSignal(false);
  return {
    waiting,
    write: (arg) => {
      if (untrack(waiting)) return Effect.runPromiseExit(Effect.interrupt);
      setWaiting(true);
      return status.track(set(arg)).then((exit) => {
        setWaiting(false);
        return exit;
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
