import { Effect, Result } from 'effect';
import { EGWData } from './egw-data.js';
import { ReaderState } from './reader-state.js';

// Opening a book without a chapter lands the reader on the "Pick a chapter"
// empty state — never what the user wants. Both Library clicks and
// last-position rehydration funnel through this helper so the first non-empty
// TocItem becomes the active chapter. On TOC fetch failure or a TOC with no
// para_id entries, we fall back to openBook so the empty state at least
// names the book.
export const openBookAtFirstChapter = (bookId: number) =>
  Effect.gen(function* () {
    const state = yield* ReaderState;
    const data = yield* EGWData;
    const tocResult = yield* data.getToc(bookId).pipe(Effect.result);
    if (Result.isFailure(tocResult)) {
      console.error('[openBookAtFirstChapter] TOC fetch failed', tocResult.failure);
      yield* state.openBook(bookId);
      return;
    }
    console.log(
      `[openBookAtFirstChapter] book=${String(bookId)} toc items=${String(tocResult.success.length)} first 3:`,
      tocResult.success.slice(0, 3),
    );
    const first = tocResult.success.find(
      (item) => item.para_id !== undefined && item.para_id !== null && item.para_id !== '',
    );
    if (first?.para_id !== undefined && first.para_id !== null && first.para_id !== '') {
      console.log(`[openBookAtFirstChapter] opening chapter para_id=${first.para_id}`);
      yield* state.openChapter(bookId, first.para_id);
    } else {
      console.warn(
        `[openBookAtFirstChapter] no chapter with para_id found, falling back to openBook`,
      );
      yield* state.openBook(bookId);
    }
  });
