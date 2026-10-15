// The review index owner's browser test page (`useIndexOwner`,
// `review/index-owner.ts`) over a first read of two folders, `a` and `b`,
// each stamped 1 (its `mtime`, which the answers change). The window holds
// the owner's moves for the test: `refresh` walks the roots again (held
// until landed), `say` asks as a Set's say on `b` is sent, and
// `landTogether` lands the walk's answer (`a` stamped 2) and then the say's
// (`b` stamped 3) in one task, as two answers that land close together do.
// `window.shown` is the index as shown: each folder's ref and stamp.

import { Exit, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { createEffect, createRoot } from 'solid-js';
import type { ReviewFolder, ReviewIndex } from '../../core/review.ts';
import { type Ask } from '../../core/asked.ts';
import { useIndexOwner } from '../review/index-owner.ts';

declare global {
  interface Window {
    shown: string;
    refresh: () => void;
    say: () => void;
    landTogether: () => void;
  }
}

/** A folder with nothing in it, stamped `mtime`. */
const folder = (ref: string, mtime: number): ReviewFolder => ({
  ref,
  title: Option.none(),
  blurb: Option.none(),
  mtime,
  sets: [],
  videos: [],
  images: [],
  docs: [],
});

const FIRST: ReviewIndex = { folders: [folder('a', 1), folder('b', 1)] };
const WALKED: ReviewIndex = { folders: [folder('a', 2), folder('b', 1)] };

/** The walks out, each landed by its resolver, oldest first. */
const walks: Array<(exit: Exit.Exit<ReviewIndex>) => void> = [];
/** The say's ask, taken as it is sent. */
const sent: Array<Ask> = [];

window.shown = '';
createRoot(() => {
  const owner = useIndexOwner(
    () => AsyncResult.success(FIRST),
    () => {
      // oxlint-disable-next-line effect/noNewPromise -- the walk as the page's atom hands it (`useAtomSet`'s promise), landed by the test
      const walk = Promise.withResolvers<Exit.Exit<ReviewIndex>>();
      walks.push(walk.resolve);
      return walk.promise;
    },
  );
  createEffect(
    () => owner.index(),
    (index) => {
      window.shown = Option.match(AsyncResult.value(index), {
        onNone: () => '',
        onSome: (ix) => ix.folders.map((f) => `${f.ref}:${f.mtime}`).join(' '),
      });
    },
  );
  window.refresh = owner.again;
  window.say = () => {
    sent.push(owner.asks.ask());
  };
  window.landTogether = () => {
    for (const land of walks) land(Exit.succeed(WALKED));
    // Queued after the walk's answer: both run before the page shows either.
    // oxlint-disable-next-line effect/noGlobals -- the say's answer, landed in the walk's task
    queueMicrotask(() => {
      for (const ask of sent) ask.answer(() => owner.answered(folder('b', 3)));
    });
  };
});
