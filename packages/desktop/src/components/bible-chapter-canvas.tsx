import { formatBibleReference, getBibleBook } from '@bible/core/bible-reader';
import { Effect, Fiber, Option, Stream } from 'effect';
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js';
import { runtime } from '../runtime.js';
import { BibleReaderState, type BibleReaderSelection } from '../services/bible-reader-state.js';
import { KjvBible, type KjvChapter } from '../services/kjv-bible.js';
import { BibleBooksGrid } from './bible-books-grid.js';
import { VerseRenderer } from './bible/verse-renderer.js';

// Main canvas for Bible mode. Subscribes to BibleReaderState, loads the KJV
// chapter via the KjvBible service, and renders verses with the same
// segmentation/red-letter rules used inside the drawer. Verse clicks update
// the cursor — the right-side EGW commentary drawer (F3.5) keys off that.
//
// Mirrors the pattern of ReaderPane → BookFeed for the EGW reader, but the
// model is much smaller: one chapter per render, verse-anchored scroll
// instead of paragraph IDs.

type Load =
  | { readonly _tag: 'idle' }
  | { readonly _tag: 'loading' }
  | { readonly _tag: 'ready'; readonly chapter: KjvChapter }
  | { readonly _tag: 'missing' }
  | { readonly _tag: 'error'; readonly message: string };

export const BibleChapterCanvas: Component = () => {
  const [selection, setSelection] = createSignal<Option.Option<BibleReaderSelection>>(
    Option.none(),
  );
  const [load, setLoad] = createSignal<Load>({ _tag: 'idle' });

  // Per-verse refs let us scroll precisely to the highlight target after a
  // chapter renders. Reset on every chapter swap — stale element refs hang
  // around in the map even after the <For> unmounts the prior rows.
  const verseRefs = new Map<number, HTMLElement>();

  onMount(() => {
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const state = yield* BibleReaderState;
        yield* state.changes.pipe(
          Stream.runForEach((next) => Effect.sync(() => setSelection(next))),
        );
      }),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(fiber));
    });
  });

  // Sequence guard: chapter swaps in flight when a new selection lands should
  // not overwrite the newer chapter's load state.
  let loadSeq = 0;
  createEffect(() => {
    const sel = selection();
    verseRefs.clear();
    if (Option.isNone(sel)) {
      setLoad({ _tag: 'idle' });
      return;
    }
    const { book, chapter } = sel.value;
    const mine = ++loadSeq;
    setLoad({ _tag: 'loading' });
    runtime
      .runPromise(
        Effect.gen(function* () {
          const svc = yield* KjvBible;
          return yield* svc.getChapter(book, chapter);
        }),
      )
      .then((opt) => {
        if (mine !== loadSeq) return;
        if (Option.isNone(opt)) {
          setLoad({ _tag: 'missing' });
          return;
        }
        setLoad({ _tag: 'ready', chapter: opt.value });
      })
      .catch((err: unknown) => {
        if (mine !== loadSeq) return;
        setLoad({
          _tag: 'error',
          message: err instanceof Error ? err.message : 'Failed to load chapter.',
        });
      });
  });

  // After the chapter renders, honor the one-shot highlightVerse cue (scroll
  // + clear). Skip for plain cursor changes — those are handled by the verse
  // button onClick, not by scroll.
  createEffect(() => {
    const sel = selection();
    const l = load();
    if (Option.isNone(sel) || l._tag !== 'ready') return;
    const hi = Option.getOrNull(sel.value.highlightVerse);
    if (hi === null) return;
    queueMicrotask(() => {
      verseRefs.get(hi)?.scrollIntoView({ block: 'center', behavior: 'auto' });
      void runtime.runPromise(
        Effect.gen(function* () {
          const state = yield* BibleReaderState;
          yield* state.clearHighlight;
        }),
      );
    });
  });

  const onVerseClick = (verse: number): void => {
    void runtime.runPromise(
      Effect.gen(function* () {
        const state = yield* BibleReaderState;
        yield* state.setVerse(verse);
      }),
    );
  };

  const cursorVerse = createMemo(() => {
    const sel = selection();
    return Option.isSome(sel) ? Option.getOrNull(sel.value.verse) : null;
  });

  // Narrow helpers — Solid's <Match when={X ? Y : null}> idiom needs the truthy
  // branch to carry the already-narrowed payload. Returning the load object
  // when its tag matches lets the render fn receive a typed value.
  const errorLoad = (): { readonly message: string } | null => {
    const l = load();
    return l._tag === 'error' ? { message: l.message } : null;
  };
  const readyChapter = (): KjvChapter | null => {
    const l = load();
    return l._tag === 'ready' ? l.chapter : null;
  };

  return (
    <div class="h-full overflow-y-auto">
      <Switch>
        <Match when={load()._tag === 'loading'}>
          <div class="mx-auto max-w-[var(--reader-width,68ch)] px-6 py-10">
            <ChapterHeader selection={selection()} />
            <p class="mt-6 text-ui-sm text-muted">Loading…</p>
          </div>
        </Match>
        <Match when={load()._tag === 'missing'}>
          <div class="mx-auto max-w-[var(--reader-width,68ch)] px-6 py-10">
            <ChapterHeader selection={selection()} />
            <p class="mt-6 text-ui-sm text-muted">Chapter not found.</p>
          </div>
        </Match>
        <Match when={errorLoad()} keyed>
          {(err) => (
            <div class="mx-auto max-w-[var(--reader-width,68ch)] px-6 py-10">
              <ChapterHeader selection={selection()} />
              <p class="mt-6 text-ui-sm text-muted">Failed to load chapter — {err.message}</p>
            </div>
          )}
        </Match>
        <Match when={readyChapter()} keyed>
          {(chapter) => (
            <div class="mx-auto max-w-[var(--reader-width,68ch)] px-6 py-10">
              <ChapterBody
                chapter={chapter}
                cursorVerse={cursorVerse()}
                verseRefs={verseRefs}
                onVerseClick={onVerseClick}
              />
            </div>
          )}
        </Match>
        <Match when={load()._tag === 'idle' && Option.isNone(selection())}>
          <BibleBooksGrid />
        </Match>
      </Switch>
    </div>
  );
};

const ChapterHeader: Component<{ readonly selection: Option.Option<BibleReaderSelection> }> = (
  props,
) => {
  const title = createMemo(() => {
    const sel = Option.getOrNull(props.selection);
    if (sel === null) return null;
    const book = getBibleBook(sel.book);
    if (!book) return `${String(sel.book)} ${String(sel.chapter)}`;
    return formatBibleReference({ book: sel.book, chapter: sel.chapter });
  });
  return (
    <Show when={title()}>
      {(t) => <h1 class="m-0 text-ui-2xl font-semibold tracking-[-0.005em] text-fg">{t()}</h1>}
    </Show>
  );
};

const ChapterBody: Component<{
  readonly chapter: KjvChapter;
  readonly cursorVerse: number | null;
  readonly verseRefs: Map<number, HTMLElement>;
  readonly onVerseClick: (verse: number) => void;
}> = (props) => (
  <>
    <h1 class="m-0 text-ui-2xl font-semibold tracking-[-0.005em] text-fg">
      {props.chapter.bookName} {props.chapter.chapter}
    </h1>
    <div class="mt-6 flex flex-col gap-3 font-[family-name:var(--reader-font-family,var(--font-serif))] text-[length:var(--reader-font-size,18px)] leading-[var(--reader-line-height,1.55)] text-fg">
      <For each={props.chapter.verses}>
        {(v) => {
          const isCursor = (): boolean => v.verse === props.cursorVerse;
          return (
            <p
              class="m-0 -mx-2 rounded px-2 py-1 data-[cursor=true]:bg-accent-soft"
              data-cursor={isCursor() ? 'true' : undefined}
              ref={(el) => {
                props.verseRefs.set(v.verse, el);
              }}
            >
              <button
                type="button"
                class="mr-2 cursor-pointer bg-transparent border-0 p-0 text-[0.78em] text-muted [font-variant-numeric:tabular-nums] hover:text-accent hover:underline select-none"
                title={`Focus verse ${String(v.verse)}`}
                onClick={() => props.onVerseClick(v.verse)}
              >
                {v.verse}
              </button>
              <VerseRenderer text={v.text} />
            </p>
          );
        }}
      </For>
    </div>
  </>
);
