// A page's unsent comments: one draft per key, shared by every box of it.

import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { draftBook } from './draft-book.ts';

describe("a page's draft book", () => {
  it.effect(
    'keeps one draft per key: a box made later reads what an earlier one wrote, and empties it',
    () =>
      Effect.sync(() => {
        const draft = draftBook();
        const closed = draft('scene:open');
        expect(closed.get()).toBe('');
        closed.set('the roof is too dark');
        // A box opened since, of the same key, reads the one draft; another key has its own.
        const opened = draft('scene:open');
        expect(opened.get()).toBe('the roof is too dark');
        expect(draft('scene:close').get()).toBe('');
        // The say the closed box sent lands: its draft empties the box open now.
        closed.set('');
        expect(opened.get()).toBe('');
        // Each book is a page's own.
        expect(draftBook()('scene:open').get()).toBe('');
      }),
  );
});
