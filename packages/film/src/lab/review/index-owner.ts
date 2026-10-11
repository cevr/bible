// The review's index, the one owner of it for the page's life: the first read
// (the server's, sent with the page), then the newest ask's answer
// (`asked.ts`): a walk of the roots again (Refresh, a say on Project), or a
// say's answer for one folder (a Set's), put in its place. Every write is an
// updater over the newest answer, shown or not yet: two answers that land in
// one task (a walk's, then a Set say's) both stand.

import { Exit, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { Accessor } from 'solid-js';
import { createMemo, createSignal, untrack } from 'solid-js';
import type { ReviewFolder, ReviewIndex } from '../../core/review.ts';
import { type Asks, newestAsked } from './asked.ts';

/** The review's index as the newest ask answered it. */
export interface IndexOwner<E> {
  /**
   * Every folder with something to review: the newest answer once one has
   * landed, else the first read.
   */
  readonly index: Accessor<AsyncResult.AsyncResult<ReviewIndex, E>>;
  /**
   * Its asks, in the order they are made: each walk, and each write that
   * answers a folder of the index (a Set's say), as it is sent.
   */
  readonly asks: Asks;
  /** Walk the roots again now: an ask, shown when it lands unless a newer one was. */
  readonly again: () => void;
  /**
   * A write's answer, `folder` as the write left it, put in its place in the
   * newest answer (one landed in this task and not shown yet too): only
   * through its `Landed.show` on `asks`.
   */
  readonly answered: (folder: ReviewFolder) => void;
}

/** `index` with `folder` in the place of the folder of its ref. */
const withFolder = (index: ReviewIndex, folder: ReviewFolder): ReviewIndex => ({
  ...index,
  folders: index.folders.map((f) =>
    Option.getOrElse(
      Option.liftPredicate(folder, (answered) => answered.ref === f.ref),
      () => f,
    ),
  ),
});

/**
 * The index over `first` (the first read), walked again by `walk`: the owner
 * a review page makes once, in its root.
 */
export const useIndexOwner = <E>(
  first: Accessor<AsyncResult.AsyncResult<ReviewIndex, E>>,
  walk: () => Promise<Exit.Exit<ReviewIndex, unknown>>,
): IndexOwner<E> => {
  const [answered, setAnswered] = createSignal(Option.none<ReviewIndex>());
  const index = createMemo(() =>
    Option.match(answered(), {
      onNone: first,
      onSome: (ix) => AsyncResult.success<ReviewIndex, E>(ix),
    }),
  );
  const asks = newestAsked();
  return {
    index,
    asks,
    again: () => {
      const ask = asks.ask();
      void walk().then((exit) => {
        if (Exit.isSuccess(exit)) ask.answer(() => setAnswered(Option.some(exit.value)));
      });
    },
    answered: (folder) => {
      setAnswered((was) =>
        Option.map(
          Option.orElse(was, () => AsyncResult.value(untrack(first))),
          (ix) => withFolder(ix, folder),
        ),
      );
    },
  };
};
