import { it } from '@effect/vitest';
import { Effect, Fiber, Option, Stream } from 'effect';
import { expect } from 'vitest';
import { createBibleDrawerState, type DrawerTarget } from '../src/services/bible-drawer-state.js';
import { BibleReaderState } from '../src/services/bible-reader-state.js';

// The cursor-sync wiring lives in `BibleDrawer.tsx` as an `onMount` body:
// it subscribes to `BibleReaderState.changes` and forwards any selection
// with a defined verse into the drawer's `setTarget`. The body is ~10
// lines and tied to Solid's lifecycle, so testing it through
// `renderToString` would mean spinning up the DOM AND it wouldn't run
// `onMount` under SSR anyway.
//
// Instead, mirror the subscription contract in pure Effect here. If a
// future refactor changes the translation (e.g. forwarding None
// selections, or dropping the verse filter), this test fails — which is
// exactly what we want, because the BibleDrawer body would have to
// change too.

const startCursorSync = (state: ReturnType<typeof createBibleDrawerState>) =>
  Effect.gen(function* () {
    const reader = yield* BibleReaderState;
    return yield* reader.changes.pipe(
      Stream.runForEach((sel) =>
        Effect.sync(() => {
          if (Option.isNone(sel)) return;
          const verse = Option.getOrNull(sel.value.verse);
          if (verse === null) return;
          state.setTarget({
            book: sel.value.book,
            chapter: sel.value.chapter,
            verse,
          });
        }),
      ),
      Effect.forkDetach,
    );
  });

it.effect('forwards (book, chapter, verse) from BibleReaderState into setTarget', () =>
  Effect.gen(function* () {
    const drawer = createBibleDrawerState();
    // setTarget is a no-op while the drawer is closed (intentional —
    // don't re-render invisible content). Open with a placeholder so
    // subsequent updates land.
    drawer.open(40, 5, 3); // Matt 5:3
    expect(drawer.target()).toEqual<DrawerTarget>({ book: 40, chapter: 5, verse: 3 });

    const fiber = yield* startCursorSync(drawer);
    // Give the subscription a tick to attach before driving the reader.
    yield* Effect.yieldNow;

    const reader = yield* BibleReaderState;
    yield* reader.openChapterAt(40, 5, 7);
    yield* Effect.yieldNow;
    expect(drawer.target()).toEqual<DrawerTarget>({ book: 40, chapter: 5, verse: 7 });

    yield* reader.setVerse(11);
    yield* Effect.yieldNow;
    expect(drawer.target()).toEqual<DrawerTarget>({ book: 40, chapter: 5, verse: 11 });

    yield* Fiber.interrupt(fiber);
  }).pipe(Effect.provide(BibleReaderState.layerTest())),
);

it.effect('ignores selection changes that carry no verse', () =>
  Effect.gen(function* () {
    const drawer = createBibleDrawerState();
    drawer.open(40, 5, 3);

    const fiber = yield* startCursorSync(drawer);
    yield* Effect.yieldNow;

    const reader = yield* BibleReaderState;
    // openChapter (no verse) shouldn't move the drawer cursor — the
    // drawer is verse-pinned, so a chapter-only signal carries no
    // information about which verse to focus on.
    yield* reader.openChapter(40, 6);
    yield* Effect.yieldNow;
    expect(drawer.target()).toEqual<DrawerTarget>({ book: 40, chapter: 5, verse: 3 });

    yield* Fiber.interrupt(fiber);
  }).pipe(Effect.provide(BibleReaderState.layerTest())),
);

it.effect('does not move target when the drawer is closed', () =>
  Effect.gen(function* () {
    const drawer = createBibleDrawerState();
    // Drawer starts closed. setTarget is a no-op in that state.
    expect(drawer.isOpen()).toBe(false);

    const fiber = yield* startCursorSync(drawer);
    yield* Effect.yieldNow;

    const reader = yield* BibleReaderState;
    yield* reader.openChapterAt(40, 5, 7);
    yield* Effect.yieldNow;
    // Target stays null because setTarget guards on isOpen.
    expect(drawer.target()).toBeNull();

    yield* Fiber.interrupt(fiber);
  }).pipe(Effect.provide(BibleReaderState.layerTest())),
);

it.effect('clears the studyFocus hint on cursor-driven retarget', () =>
  Effect.gen(function* () {
    const drawer = createBibleDrawerState();
    // Open with a Strong's focus, simulating a Strong's-super click.
    drawer.open(40, 5, 3, 'words', { _tag: 'strongs', verse: 3, code: 'G2316' });
    expect(drawer.studyFocus()).toEqual({ _tag: 'strongs', verse: 3, code: 'G2316' });

    const fiber = yield* startCursorSync(drawer);
    yield* Effect.yieldNow;

    const reader = yield* BibleReaderState;
    yield* reader.openChapterAt(40, 5, 11);
    yield* Effect.yieldNow;
    // The user moved the cursor — the focus hint was tied to verse 3 and
    // should be reset rather than misapplied to verse 11.
    expect(drawer.studyFocus()).toEqual({ _tag: 'none' });

    yield* Fiber.interrupt(fiber);
  }).pipe(Effect.provide(BibleReaderState.layerTest())),
);
