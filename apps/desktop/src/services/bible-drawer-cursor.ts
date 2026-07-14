import { Effect, Option, Stream } from 'effect';
import type { BibleDrawerState } from './bible-drawer-state.js';
import { BibleReaderState } from './bible-reader-state.js';

type CursorTarget = Pick<BibleDrawerState, 'cursorMoved'>;

/**
 * Connect the Bible reader's verse cursor to the verse-pinned Study drawer.
 * Chapter-only and closed-reader selections carry no verse, so they do not
 * retarget the drawer.
 */
export const connectBibleDrawerCursor = Effect.fn('BibleDrawerCursor.connect')(function* (
  drawer: CursorTarget,
) {
  const reader = yield* BibleReaderState;
  yield* reader.changes.pipe(
    Stream.runForEach((selection) =>
      Effect.sync(() => {
        if (Option.isNone(selection)) return;
        if (selection.value._tag !== 'verse') return;
        drawer.cursorMoved({
          book: selection.value.book,
          chapter: selection.value.chapter,
          verse: selection.value.verse,
        });
      }),
    ),
  );
});
