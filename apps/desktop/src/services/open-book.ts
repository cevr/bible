import { Effect, Option, Result } from 'effect';
import { EGWData } from './egw-data.js';
import { lastChapterMemory } from './last-chapter-memory.js';
import { ReaderState } from './reader-state.js';

// Opening a book without a chapter lands the reader on the "Pick a chapter"
// empty state — never what the user wants. Both Library clicks and
// last-position rehydration funnel through this helper so the user lands on
// a sensible chapter:
//   1. If we've recorded a last-visited chapter for this book this session,
//      open that chapter (the user expects book-hopping to resume where they
//      left off).
//   2. Otherwise open the first TocItem with a para_id.
//   3. On TOC fetch failure or a TOC with no para_id entries, fall back to
//      openBook so the empty state at least names the book.
export const openBookAtFirstChapter = (bookId: number) =>
  Effect.gen(function* () {
    const state = yield* ReaderState;
    const remembered = lastChapterMemory.getEgw(bookId);
    if (remembered !== undefined) {
      yield* state.openChapter(bookId, remembered);
      return;
    }
    const data = yield* EGWData;
    const tocResult = yield* data.getToc(bookId).pipe(Effect.result);
    if (Result.isFailure(tocResult)) {
      console.error('[openBookAtFirstChapter] TOC fetch failed', tocResult.failure);
      yield* state.openBook(bookId);
      return;
    }
    const first = tocResult.success.find((item) => Option.isSome(item.para_id));
    if (first !== undefined && Option.isSome(first.para_id)) {
      yield* state.openChapter(bookId, first.para_id.value);
    } else {
      console.warn(
        `[openBookAtFirstChapter] no chapter with para_id found, falling back to openBook`,
      );
      yield* state.openBook(bookId);
    }
  });
