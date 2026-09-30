// How a read or a write in flight reads on the review's pages: a read's value
// once it has one (else what it waits on, or why it failed), and a write's
// status line. Every page says these the same way.

import { type JSX, Show } from '@solidjs/web';
import { Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { Accessor } from 'solid-js';
import type { LabFailure } from '../api.ts';

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
