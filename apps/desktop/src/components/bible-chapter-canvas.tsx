import { formatBibleReference, getBibleBook } from '@bible/core/bible-reader';
import { Effect, Exit, Fiber, Option, Stream } from 'effect';
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { ipc, runtime } from '../runtime.js';
import { BibleReaderState, type BibleReaderSelection } from '../services/bible-reader-state.js';
import { KjvBible, type KjvChapter, type KjvStrongsWord } from '../services/kjv-bible.js';
import { BibleBooksGrid } from './bible-books-grid.js';
import { StrongsVerse } from './bible/strongs-verse.js';
import { VerseRenderer } from './bible/verse-renderer.js';
import { ChapterNavButtons } from './book-feed.js';

// Main canvas for Bible mode. Subscribes to BibleReaderState, loads the KJV
// chapter via the ipc proxy, and renders verses with the same segmentation /
// red-letter rules used inside the drawer. Verse clicks update the cursor —
// the right-side EGW commentary drawer (F3.5) keys off that.
//
// Mirrors the pattern of ReaderPane → BookFeed for the EGW reader, but the
// model is much smaller: one chapter per render, verse-anchored scroll
// instead of paragraph IDs. Suspense/ErrorBoundary live at the parent.

// Renderer-level LRU keeps the previous chapter visible while the next one
// resolves so cache-warm prev/next nav doesn't flash a "Loading…" fallback.
// Same pattern as book-feed.tsx — peek before reading the suspending resource;
// mirror successful reads back in via createEffect.
const CHAPTER_CACHE_CAP = 24;
const chapterCache = new Map<string, KjvChapter>();
const chapterKey = (book: number, chapter: number): string => `${String(book)}:${String(chapter)}`;
const cacheGet = (book: number, chapter: number): KjvChapter | undefined => {
  const k = chapterKey(book, chapter);
  const v = chapterCache.get(k);
  if (v === undefined) return undefined;
  chapterCache.delete(k);
  chapterCache.set(k, v);
  return v;
};
const cachePut = (book: number, chapter: number, value: KjvChapter): void => {
  const k = chapterKey(book, chapter);
  chapterCache.delete(k);
  chapterCache.set(k, value);
  while (chapterCache.size > CHAPTER_CACHE_CAP) {
    const oldest = chapterCache.keys().next().value;
    if (oldest === undefined) break;
    chapterCache.delete(oldest);
  }
};
// Adjacent-chapter preload reads the KJV service directly rather than going
// through the ipc proxy — proxy reads need a Solid tracking scope and we want
// to warm from a createEffect that's already tracked for prev/next.
const inFlight = new Map<string, Promise<void>>();
const preloadChapter = async (book: number, chapter: number): Promise<void> => {
  const k = chapterKey(book, chapter);
  if (chapterCache.has(k)) return;
  const existing = inFlight.get(k);
  if (existing !== undefined) return existing;
  const p = runtime
    .runPromiseExit(
      Effect.gen(function* () {
        const svc = yield* KjvBible;
        return yield* svc.getChapter(book, chapter);
      }),
    )
    .then((exit) => {
      if (Exit.isSuccess(exit) && Option.isSome(exit.value)) {
        cachePut(book, chapter, exit.value.value);
      }
    })
    .catch(() => {
      /* preload best-effort */
    })
    .finally(() => {
      inFlight.delete(k);
    });
  inFlight.set(k, p);
  return p;
};

export interface BibleChapterCanvasProps {
  /** Open the study drawer's Words tab pinned to a specific (book, chapter,
   *  verse) and Strong's code. Used by the inline Strong's overlay so a
   *  click on a superscript code drills into the lexicon. */
  readonly onOpenStrongs: (book: number, chapter: number, verse: number, code: string) => void;
  /** Open the right-side scripture drawer's Notes tab pinned to a specific
   *  (book, chapter, verse). Used by the inline margin-note overlay. */
  readonly onOpenMarginNote: (book: number, chapter: number, verse: number) => void;
  /** Open the right-side scripture drawer's Xrefs tab pinned to a specific
   *  (book, chapter, verse). Used by the inline cross-reference overlay. */
  readonly onOpenCrossRefs: (book: number, chapter: number, verse: number) => void;
  /** Inline-overlay toggle state, threaded in from the persistence layer
   *  (ReaderSettings). The canvas reads via accessors so a settings flip
   *  invalidates downstream memos without prop-drill churn. */
  readonly inlineStrongs: () => boolean;
  readonly inlineMarginNotes: () => boolean;
  readonly inlineCrossRefs: () => boolean;
  readonly onToggleInlineStrongs: () => void;
  readonly onToggleInlineMarginNotes: () => void;
  readonly onToggleInlineCrossRefs: () => void;
}

export const BibleChapterCanvas: Component<BibleChapterCanvasProps> = (props) => {
  const [selection, setSelection] = createSignal<Option.Option<BibleReaderSelection>>(
    Option.none(),
  );

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

  return (
    <div class="h-full overflow-y-auto">
      <Show when={Option.isSome(selection())}>
        <BibleReaderToolbar
          inlineStrongs={props.inlineStrongs}
          inlineMarginNotes={props.inlineMarginNotes}
          inlineCrossRefs={props.inlineCrossRefs}
          onToggleStrongs={props.onToggleInlineStrongs}
          onToggleMarginNotes={props.onToggleInlineMarginNotes}
          onToggleCrossRefs={props.onToggleInlineCrossRefs}
        />
      </Show>
      <Show
        when={(() => {
          const sel = Option.getOrNull(selection());
          if (sel === null) return null;
          return `${String(sel.book)}:${String(sel.chapter)}` as const;
        })()}
        keyed
        fallback={<BibleBooksGrid />}
      >
        {/* Key on book:chapter only — verse-cursor changes reactively flow
            through props.selection without re-mounting ChapterShell (which
            would reset scroll, refetch the chapter, and drop verseRefs). */}
        {(_key) => (
          <ChapterShell
            selection={() =>
              Option.getOrElse(selection(), () => ({
                book: 0,
                chapter: 0,
                verse: Option.none<number>(),
              }))
            }
            inlineStrongs={props.inlineStrongs()}
            inlineMarginNotes={props.inlineMarginNotes()}
            inlineCrossRefs={props.inlineCrossRefs()}
            onOpenStrongs={props.onOpenStrongs}
            onOpenMarginNote={props.onOpenMarginNote}
            onOpenCrossRefs={props.onOpenCrossRefs}
          />
        )}
      </Show>
    </div>
  );
};

const ChapterShell: Component<{
  readonly selection: () => BibleReaderSelection;
  readonly inlineStrongs: boolean;
  readonly inlineMarginNotes: boolean;
  readonly inlineCrossRefs: boolean;
  readonly onOpenStrongs: (book: number, chapter: number, verse: number, code: string) => void;
  readonly onOpenMarginNote: (book: number, chapter: number, verse: number) => void;
  readonly onOpenCrossRefs: (book: number, chapter: number, verse: number) => void;
}> = (props) => {
  const book = (): number => props.selection().book;
  const chapter = (): number => props.selection().chapter;

  const chapterRes = ipc.bible.getChapter.query(() => ({
    book: book(),
    chapter: chapter(),
  }));
  // Single round-trip for the lightweight overlay marker sets
  // (notes + xrefs). Strong's stays on its own query — it's heavy and
  // structurally different, so the StrongsLoader mount-only component
  // handles it independently when the toggle is on.
  const markersRes = ipc.bible.getChapterMarkers.query(() => ({
    book: book(),
    chapter: chapter(),
  }));

  // Mirror successful reads into the renderer LRU so adjacent preloads and
  // warm remounts have a synchronous data source on the next nav.
  createEffect(() => {
    const c = chapterRes();
    if (c === undefined || c === null) return;
    cachePut(book(), chapter(), c);
  });

  // Per-verse refs for scroll-into-view on highlight cues. Reset on chapter
  // swap — stale refs hang around in the map after <For> unmounts the rows.
  // Track via memos so verse-only updates to props.selection() don't trigger
  // the reset (which would race the verse-sync effect's lookup).
  const verseRefs = new Map<number, HTMLElement>();
  const bookMemo = createMemo(() => book());
  const chapterMemo = createMemo(() => chapter());
  createEffect(() => {
    void bookMemo();
    void chapterMemo();
    verseRefs.clear();
  });

  // Peek the LRU first so a warm prev/next renders without triggering the
  // parent <Suspense>. On cold load the resource read suspends; on null
  // (chapter missing) we render the reimport UI inline.
  const peekedChapter = createMemo<KjvChapter | undefined>(() => cacheGet(book(), chapter()));

  // Decode the unified marker bundle once and key the per-overlay memos off
  // it. Each memo short-circuits to empty when its toggle is off so the
  // verse rows don't repaint when an unrelated overlay flips.
  const xrefVerses = createMemo<ReadonlySet<number>>(() => {
    if (!props.inlineCrossRefs) return new Set<number>();
    const m = markersRes();
    if (m === undefined) return new Set<number>();
    return new Set(m.xrefVerses);
  });

  // Verse-sync effect: whenever the focused verse changes, bring it into
  // view IF it isn't already on screen. The off-screen check is what lets
  // verse-number clicks set the cursor without jumping the page — the click
  // target is by definition in viewport, so scrollIntoView is suppressed.
  //
  // Why rAF + retry, not queueMicrotask: when this effect fires synchronously
  // with the chapter resource resolving, the inner <Show keyed>/<For> over
  // verses may not have committed DOM ref callbacks yet — so verseRefs.get
  // returns undefined. rAF runs after paint; the retry covers the cold-render
  // case where <For> needs an extra tick (e.g. long chapter behind Suspense).
  createEffect(() => {
    const sel = props.selection();
    const target = Option.getOrNull(sel.verse);
    if (target === null) return;
    const ready = peekedChapter() ?? chapterRes();
    if (ready === undefined || ready === null) return;
    const tryScroll = (attempt: number): void => {
      const el = verseRefs.get(target);
      if (el !== undefined) {
        const rect = el.getBoundingClientRect();
        const container = el.closest<HTMLElement>('.overflow-y-auto');
        const bounds = container?.getBoundingClientRect() ?? {
          top: 0,
          bottom: window.innerHeight,
        };
        const onScreen = rect.top >= bounds.top && rect.bottom <= bounds.bottom;
        if (!onScreen) {
          el.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
        return;
      }
      if (attempt < 3) {
        setTimeout(() => tryScroll(attempt + 1), 0);
      }
    };
    // setTimeout not rAF: rAF callbacks scheduled inside a Solid createEffect
    // mid-flush sometimes get coalesced/dropped in this Electron renderer,
    // observed via console instrumentation. setTimeout(0) is fiber-safe and
    // still queues after the current microtask drain so DOM ref callbacks
    // commit before tryScroll reads verseRefs.
    setTimeout(() => tryScroll(0), 0);
  });

  // Adjacent-chapter preload — warms the renderer LRU + EgwCommentary cache
  // so prev/next nav resolves synchronously.
  type Loc = { readonly book: number; readonly chapter: number; readonly label: string };
  const adjacentChapter = (direction: -1 | 1): Loc | null => {
    const b = book();
    const ch = chapter();
    const meta = getBibleBook(b);
    if (!meta) return null;
    const nextChapter = ch + direction;
    if (nextChapter >= 1 && nextChapter <= meta.chapters) {
      return {
        book: b,
        chapter: nextChapter,
        label: formatBibleReference({ book: b, chapter: nextChapter }),
      };
    }
    const adjBookNum = b + direction;
    const adjBook = getBibleBook(adjBookNum);
    if (!adjBook) return null;
    const adjChapter = direction === 1 ? 1 : adjBook.chapters;
    return {
      book: adjBookNum,
      chapter: adjChapter,
      label: formatBibleReference({ book: adjBookNum, chapter: adjChapter }),
    };
  };
  const prevLoc = createMemo<Loc | null>(() => {
    void book();
    void chapter();
    return adjacentChapter(-1);
  });
  const nextLoc = createMemo<Loc | null>(() => {
    void book();
    void chapter();
    return adjacentChapter(1);
  });
  createEffect(() => {
    const prev = prevLoc();
    const next = nextLoc();
    const warm = (loc: Loc | null): void => {
      if (loc === null) return;
      void preloadChapter(loc.book, loc.chapter);
      // Markers (commentary / notes / xrefs) are tiny and resolve in a
      // single IPC round-trip — they fetch on first mount of the next
      // chapter and the visual gap is imperceptible, so no proactive warm
      // is needed here. The pulse fiber above takes care of freshening
      // commentary when the indexer reports new refs.
    };
    warm(prev);
    warm(next);
  });

  const onVerseClick = (verse: number): void => {
    void runtime.runPromise(
      Effect.gen(function* () {
        const state = yield* BibleReaderState;
        yield* state.setVerse(verse);
      }),
    );
  };
  const goTo = (loc: Loc | null): void => {
    if (loc === null) return;
    void runtime.runPromise(
      Effect.gen(function* () {
        const state = yield* BibleReaderState;
        yield* state.openChapter(loc.book, loc.chapter);
      }),
    );
  };
  const goPrev = (): void => goTo(prevLoc());
  const goNext = (): void => goTo(nextLoc());

  const chapterOptions = createMemo<readonly { readonly value: string; readonly label: string }[]>(
    () => {
      const meta = getBibleBook(book());
      if (!meta) return [];
      const out: { readonly value: string; readonly label: string }[] = [];
      for (let i = 1; i <= meta.chapters; i++) {
        out.push({
          value: `${String(book())}:${String(i)}`,
          label: formatBibleReference({ book: book(), chapter: i }),
        });
      }
      return out;
    },
  );

  const goFirst = (): void => {
    if (chapter() === 1) return;
    goTo({
      book: book(),
      chapter: 1,
      label: formatBibleReference({ book: book(), chapter: 1 }),
    });
  };
  const goLast = (): void => {
    const meta = getBibleBook(book());
    if (!meta) return;
    if (chapter() === meta.chapters) return;
    goTo({
      book: book(),
      chapter: meta.chapters,
      label: formatBibleReference({ book: book(), chapter: meta.chapters }),
    });
  };

  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.altKey) return;
    if (isEditableTarget(e.target)) return;
    const jumpToEdge = e.metaKey || e.ctrlKey;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (jumpToEdge) goFirst();
      else goPrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (jumpToEdge) goLast();
      else goNext();
    }
  };
  createEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  const cursorVerse = createMemo<number | null>(() => Option.getOrNull(props.selection().verse));

  const title = (): string => {
    const meta = getBibleBook(book());
    if (!meta) return `${String(book())} ${String(chapter())}`;
    return formatBibleReference({ book: book(), chapter: chapter() });
  };

  // Resolve the chapter for render. Peek the LRU first so prev/next nav
  // bypasses Suspense entirely on a warm cache hit. On a miss, read the
  // resource — that may suspend (caught by parent <Suspense>), resolve to
  // null (chapter missing → reimport UI), or yield a real chapter.
  type ChapterState =
    | { readonly _tag: 'loading' }
    | { readonly _tag: 'missing' }
    | { readonly _tag: 'ready'; readonly chapter: KjvChapter };
  const chapterState = createMemo<ChapterState>(() => {
    const peek = peekedChapter();
    if (peek !== undefined) return { _tag: 'ready', chapter: peek };
    const fresh = chapterRes();
    if (fresh === undefined) return { _tag: 'loading' };
    if (fresh === null) return { _tag: 'missing' };
    return { _tag: 'ready', chapter: fresh };
  });

  return (
    <>
      <ChapterNavButtons
        prevTitle={() => prevLoc()?.label ?? undefined}
        nextTitle={() => nextLoc()?.label ?? undefined}
        onPrev={goPrev}
        onNext={goNext}
        options={chapterOptions}
        current={() => `${String(book())}:${String(chapter())}`}
        onPick={(value) => {
          const [bStr, cStr] = value.split(':');
          if (bStr === undefined || cStr === undefined) return;
          const b = Number(bStr);
          const c = Number(cStr);
          if (!Number.isFinite(b) || !Number.isFinite(c)) return;
          goTo({ book: b, chapter: c, label: formatBibleReference({ book: b, chapter: c }) });
        }}
      />
      <Show
        when={chapterState()._tag === 'missing'}
        fallback={
          <Show
            when={(() => {
              const s = chapterState();
              return s._tag === 'ready' ? s.chapter : null;
            })()}
            keyed
          >
            {(c) => (
              <div class="mx-auto max-w-[var(--reader-width,68ch)] px-6 py-10">
                <ReaderHeader title={`${c.bookName} ${String(c.chapter)}`} />
                <ChapterBody
                  chapter={c}
                  cursorVerse={cursorVerse()}
                  xrefVerses={xrefVerses()}
                  verseRefs={verseRefs}
                  onVerseClick={onVerseClick}
                  inlineStrongs={props.inlineStrongs}
                  inlineMarginNotes={props.inlineMarginNotes}
                  inlineCrossRefs={props.inlineCrossRefs}
                  onOpenStrongs={(verse, code) =>
                    props.onOpenStrongs(book(), chapter(), verse, code)
                  }
                  onOpenMarginNote={(verse) => props.onOpenMarginNote(book(), chapter(), verse)}
                  onOpenCrossRefs={(verse) => props.onOpenCrossRefs(book(), chapter(), verse)}
                />
              </div>
            )}
          </Show>
        }
      >
        <MissingChapter book={book()} chapter={chapter()} title={title()} />
      </Show>
    </>
  );
};

const MissingChapter: Component<{
  readonly book: number;
  readonly chapter: number;
  readonly title: string;
}> = (props) => {
  type ReimportState =
    | { readonly _tag: 'idle' }
    | { readonly _tag: 'running' }
    | { readonly _tag: 'failed'; readonly message: string };
  const [reimportState, setReimportState] = createSignal<ReimportState>({ _tag: 'idle' });
  const reimporting = (): boolean => reimportState()._tag === 'running';

  const onReimportKjv = (): void => {
    if (reimporting()) return;
    setReimportState({ _tag: 'running' });
    ipc.bible.reimportKjv
      .mutate(undefined)
      .then(() => {
        // Force the chapter query to refetch — the reimport repopulated the
        // KJV table so the previously-null result should now resolve to a
        // real chapter.
        ipc.bible.getChapter.invalidate({ book: props.book, chapter: props.chapter });
        setReimportState({ _tag: 'idle' });
      })
      .catch((err: unknown) => {
        setReimportState({
          _tag: 'failed',
          message: err instanceof Error ? err.message : 'Reimport failed.',
        });
      });
  };

  return (
    <div class="mx-auto max-w-[var(--reader-width,68ch)] px-6 py-10">
      <ReaderHeader title={props.title} />
      <p class="mt-6 text-ui-sm text-fg">
        Chapter not found. The bundled KJV database may be incomplete — a previous import probably
        crashed mid-write.
      </p>
      <p class="mt-2 text-ui-sm text-muted">
        Reimport the bundled KJV verses + Strong's lexicon to repopulate the table. Takes a few
        seconds.
      </p>
      <button
        type="button"
        class="mt-4 inline-flex items-center gap-1.5 h-[calc(32px*var(--ui-scale))] px-4 rounded-md border border-rule bg-accent text-bg text-ui-sm font-medium cursor-pointer transition-[background,border-color,opacity] duration-[0.12s] ease-in-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-wait"
        disabled={reimporting()}
        onClick={onReimportKjv}
      >
        {reimporting() ? 'Reimporting…' : 'Reimport KJV'}
      </button>
      <Show
        when={(() => {
          const s = reimportState();
          return s._tag === 'failed' ? s : null;
        })()}
      >
        {(s) => <p class="mt-3 text-ui-sm text-muted">Reimport failed — {s().message}</p>}
      </Show>
    </div>
  );
};

const ReaderHeader: Component<{
  readonly title: string | null;
}> = (props) => (
  <Show when={props.title}>
    {(t) => <h1 class="m-0 text-ui-2xl font-semibold tracking-[-0.005em] text-fg">{t()}</h1>}
  </Show>
);

const ChapterBody: Component<{
  readonly chapter: KjvChapter;
  readonly cursorVerse: number | null;
  /** Verse sets are already gated on the corresponding toggle at the
   *  ChapterShell memo level — an empty set here means "overlay off" OR
   *  "no markers in this chapter". ChapterBody doesn't need to know which.
   *  Margin notes don't appear here — they render inline next to the matched
   *  phrase via VerseRenderer + MarginNotesLoader, not as a verse-prefix `n`. */
  readonly xrefVerses: ReadonlySet<number>;
  readonly verseRefs: Map<number, HTMLElement>;
  readonly onVerseClick: (verse: number) => void;
  /** Strong's stays as a mount-only loader because the payload is large and
   *  lives on a separate IPC (`getChapterStrongs`). The remaining three
   *  marker sets come from the unified `getChapterMarkers` query. */
  readonly inlineStrongs: boolean;
  readonly inlineMarginNotes: boolean;
  readonly inlineCrossRefs: boolean;
  readonly onOpenStrongs: (verse: number, code: string) => void;
  readonly onOpenMarginNote: (verse: number) => void;
  readonly onOpenCrossRefs: (verse: number) => void;
}> = (props) => {
  // Seed both maps empty so "not loaded yet" and "loaded, no entries" share
  // a single shape — consumers read `map.get(verse) ?? <empty>` without
  // having to distinguish the two upstream states.
  const [strongsByVerse, setStrongsByVerse] = createSignal<
    ReadonlyMap<number, readonly KjvStrongsWord[]>
  >(new Map());
  const [marginNotesByVerse, setMarginNotesByVerse] = createSignal<
    ReadonlyMap<number, readonly { readonly idx: number; readonly phrase: string }[]>
  >(new Map());

  return (
    <>
      <Show when={props.inlineStrongs}>
        <StrongsLoader
          book={props.chapter.book}
          chapter={props.chapter.chapter}
          onLoaded={setStrongsByVerse}
          onCleared={() => setStrongsByVerse(new Map())}
        />
      </Show>
      <Show when={props.inlineMarginNotes}>
        <MarginNotesLoader
          book={props.chapter.book}
          chapter={props.chapter.chapter}
          onLoaded={setMarginNotesByVerse}
          onCleared={() => setMarginNotesByVerse(new Map())}
        />
      </Show>
      <div class="mt-6 flex flex-col gap-3 font-[family-name:var(--reader-font-family,var(--font-serif))] text-[length:var(--reader-font-size,18px)] leading-[var(--reader-line-height,1.55)] text-fg">
        <For each={props.chapter.verses}>
          {(v) => {
            const isCursor = (): boolean => v.verse === props.cursorVerse;
            const hasXref = (): boolean => props.inlineCrossRefs && props.xrefVerses.has(v.verse);
            const strongsWords = (): readonly KjvStrongsWord[] | null => {
              if (!props.inlineStrongs) return null;
              return strongsByVerse().get(v.verse) ?? null;
            };
            const verseMarginNotes = (): readonly {
              readonly idx: number;
              readonly phrase: string;
            }[] => {
              if (!props.inlineMarginNotes) return [];
              return marginNotesByVerse().get(v.verse) ?? [];
            };
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
                <Show
                  when={strongsWords()}
                  fallback={
                    <VerseRenderer
                      text={v.text}
                      marginNotes={verseMarginNotes()}
                      onMarginNoteClick={() => props.onOpenMarginNote(v.verse)}
                    />
                  }
                >
                  {(words) => (
                    <StrongsVerse
                      words={words()}
                      onCodeClick={(code) => props.onOpenStrongs(v.verse, code)}
                    />
                  )}
                </Show>
                <Show when={hasXref()}>
                  <button
                    type="button"
                    class="ml-1 cursor-pointer bg-transparent border-0 p-0 align-baseline text-[0.62em] font-medium text-accent opacity-70 hover:opacity-100 hover:underline select-none"
                    title={`Cross-references for verse ${String(v.verse)}`}
                    onClick={() => props.onOpenCrossRefs(v.verse)}
                  >
                    <sup>x</sup>
                  </button>
                </Show>
              </p>
            );
          }}
        </For>
      </div>
    </>
  );
};

// Mount-only loaders for the inline overlays. Each subscribes via the ipc
// proxy and pushes data up via the parent's setters; on unmount (toggle
// flipped off) the parent's signal is reset to its empty default. Using
// `.latest` keeps the verse list rendering immediately — overlays flicker
// in once the IPC resolves, then stay cached for re-toggles.
const StrongsLoader: Component<{
  readonly book: number;
  readonly chapter: number;
  readonly onLoaded: (map: ReadonlyMap<number, readonly KjvStrongsWord[]>) => void;
  readonly onCleared: () => void;
}> = (props) => {
  const res = ipc.bible.getChapterStrongs.query(() => ({
    book: props.book,
    chapter: props.chapter,
  }));
  createEffect(() => {
    const s = res.latest;
    if (s === undefined || s === null) return;
    const m = new Map<number, readonly KjvStrongsWord[]>();
    for (const v of s.verses) m.set(v.verse, v.words);
    props.onLoaded(m);
  });
  onCleanup(() => props.onCleared());
  return null;
};

// Mirrors StrongsLoader. Pulls the chapter's full notes-per-verse map and
// pushes anchor metadata (idx + phrase) up to ChapterBody so VerseRenderer
// can place inline `a`/`b`/`c` superscripts next to the matched phrase.
const MarginNotesLoader: Component<{
  readonly book: number;
  readonly chapter: number;
  readonly onLoaded: (
    map: ReadonlyMap<number, readonly { readonly idx: number; readonly phrase: string }[]>,
  ) => void;
  readonly onCleared: () => void;
}> = (props) => {
  const res = ipc.bible.getChapterMarginNotes.query(() => ({
    book: props.book,
    chapter: props.chapter,
  }));
  createEffect(() => {
    const s = res.latest;
    if (s === undefined || s === null) return;
    const m = new Map<number, readonly { readonly idx: number; readonly phrase: string }[]>();
    for (const row of s) {
      m.set(
        row.verse,
        row.notes.map((n) => ({ idx: n.idx, phrase: n.phrase })),
      );
    }
    props.onLoaded(m);
  });
  onCleanup(() => props.onCleared());
  return null;
};

// Floating toolbar pinned to the top center of the canvas. Mirrors
// `ChapterNavButtons` (book-feed.tsx) at the bottom — same pill chrome,
// same backdrop blur, same z-index — so the two read as a matched pair
// bracketing the reader column. Toggles flip the canvas-level signals
// that drive the inline overlay renders. State persists through
// ReaderSettings — see app.tsx for the wiring.
const BibleReaderToolbar: Component<{
  readonly inlineStrongs: () => boolean;
  readonly inlineMarginNotes: () => boolean;
  readonly inlineCrossRefs: () => boolean;
  readonly onToggleStrongs: () => void;
  readonly onToggleMarginNotes: () => void;
  readonly onToggleCrossRefs: () => void;
}> = (props) => (
  <div class="sticky top-3 z-10 flex justify-center pointer-events-none">
    <div class="inline-flex items-center gap-px rounded-full border border-rule bg-bg/85 backdrop-blur px-1.5 py-1 shadow-sm pointer-events-auto">
      <ToolbarToggle
        label="Strong's"
        title="Toggle inline Strong's annotations"
        pressed={props.inlineStrongs()}
        onClick={props.onToggleStrongs}
      />
      <ToolbarToggle
        label="Notes"
        title="Toggle inline margin-note markers"
        pressed={props.inlineMarginNotes()}
        onClick={props.onToggleMarginNotes}
      />
      <ToolbarToggle
        label="Xrefs"
        title="Toggle inline cross-reference markers"
        pressed={props.inlineCrossRefs()}
        onClick={props.onToggleCrossRefs}
      />
    </div>
  </div>
);

const ToolbarToggle: Component<{
  readonly label: string;
  readonly title: string;
  readonly pressed: boolean;
  readonly onClick: () => void;
}> = (props) => (
  <button
    type="button"
    class="inline-flex items-center h-7 px-3 rounded-full bg-transparent border-0 text-ui-xs text-muted cursor-pointer transition-[background,color] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] hover:text-fg focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] focus-visible:text-fg focus-visible:outline-none data-pressed:bg-accent-soft data-pressed:text-accent"
    data-pressed={props.pressed ? '' : undefined}
    title={props.title}
    aria-pressed={props.pressed}
    onClick={props.onClick}
  >
    {props.label}
  </button>
);
