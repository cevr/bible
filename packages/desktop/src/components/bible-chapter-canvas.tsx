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
import { EgwCommentary } from '../services/egw-commentary.js';
import { KjvBible, type KjvChapter } from '../services/kjv-bible.js';
import { BibleBooksGrid } from './bible-books-grid.js';
import { VerseRenderer } from './bible/verse-renderer.js';
import { ChapterNavButtons } from './book-feed.js';

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

export interface BibleChapterCanvasProps {
  /** Open the EGW commentary sheet pinned to the given verse. Routed from
   *  the footnote `e` marker on each verse with cached commentary. */
  readonly onOpenCommentary?: (verse: number) => void;
  /** Current open/closed state of the commentary drawer — drives the
   *  in-reader Commentary toggle's pressed state. */
  readonly commentaryOpen: boolean;
  /** Toggle the commentary drawer from the in-reader header button. */
  readonly onToggleCommentary: () => void;
}

export const BibleChapterCanvas: Component<BibleChapterCanvasProps> = (props) => {
  const [selection, setSelection] = createSignal<Option.Option<BibleReaderSelection>>(
    Option.none(),
  );
  const [load, setLoad] = createSignal<Load>({ _tag: 'idle' });
  // Bumped by the "Reimport KJV" recovery flow to retrigger the chapter
  // load createEffect without changing the selection.
  const [loadNonce, setLoadNonce] = createSignal(0);
  // `true` while the bundled KJV import is running in main — disables the
  // Reimport button and swaps its label so accidental double-clicks don't
  // pile up imports.
  const [reimporting, setReimporting] = createSignal(false);
  // Verses in the current chapter that have at least one cached EGW
  // paragraph. Empty Set until the per-chapter query resolves. Re-queried
  // on chapter swap and whenever the indexer pulses
  // `EgwCommentary.changes` after writing fresh refs.
  const [commentaryVerses, setCommentaryVerses] = createSignal<ReadonlySet<number>>(
    new Set<number>(),
  );

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
    // Pulse fiber — re-query the chapter hit set whenever the indexer
    // reports new EGW commentary. The service has already invalidated
    // its LRU for the touched (book, chapter) keys, so the next query
    // returns the fresh Set.
    const pulseFiber = runtime.runFork(
      Effect.gen(function* () {
        const commentary = yield* EgwCommentary;
        yield* commentary.changes.pipe(
          Stream.runForEach(() =>
            Effect.sync(() => {
              const sel = Option.getOrNull(selection());
              if (sel === null) return;
              // Re-trigger the query effect by clearing — the createEffect
              // on `selection` won't fire because selection didn't change,
              // so we kick off a fresh query inline.
              void runtime
                .runPromise(
                  Effect.gen(function* () {
                    const c = yield* EgwCommentary;
                    return yield* c.versesWithCommentary(sel.book, sel.chapter);
                  }),
                )
                .then(setCommentaryVerses)
                .catch(() => {
                  /* leave stale set on transient failure */
                });
            }),
          ),
        );
      }),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(fiber));
      void runtime.runPromise(Fiber.interrupt(pulseFiber));
    });
  });

  // Sequence guard: chapter swaps in flight when a new selection lands should
  // not overwrite the newer chapter's load state.
  let loadSeq = 0;
  // Separate guard for the hit-set query — it runs in parallel with the
  // chapter load and the user can swap chapters before either resolves.
  let commentarySeq = 0;
  createEffect(() => {
    const sel = selection();
    // Track the nonce so reimport recovery retriggers the load with the
    // same selection.
    loadNonce();
    verseRefs.clear();
    if (Option.isNone(sel)) {
      setLoad({ _tag: 'idle' });
      setCommentaryVerses(new Set<number>());
      return;
    }
    const { book, chapter } = sel.value;
    const mine = ++loadSeq;
    const mineCommentary = ++commentarySeq;
    // Keep the previous chapter visible while a new one resolves so cache-warm
    // prev/next nav doesn't flash a "Loading…" intermediate. Only show the
    // loading fallback on a cold first load.
    setLoad((prev) => (prev._tag === 'ready' ? prev : { _tag: 'loading' }));
    // Clear stale markers immediately so a brief flash of the previous
    // chapter's hit set doesn't paint on the new chapter.
    setCommentaryVerses(new Set<number>());
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
    runtime
      .runPromise(
        Effect.gen(function* () {
          const c = yield* EgwCommentary;
          return yield* c.versesWithCommentary(book, chapter);
        }),
      )
      .then((set) => {
        if (mineCommentary !== commentarySeq) return;
        setCommentaryVerses(set);
      })
      .catch(() => {
        /* leave empty set on transient failure */
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

  // Footnote marker click — focus the verse AND open the commentary sheet.
  // Two-step so the drawer's createEffect fires with the right cursor.
  const onCommentaryClick = (verse: number): void => {
    onVerseClick(verse);
    props.onOpenCommentary?.(verse);
  };

  // "Reimport KJV" affordance from the missing-state UI. Asks main to drop
  // and re-import the bundled KJV tables, then bumps the load nonce so the
  // chapter load createEffect re-runs against the freshly populated table.
  const onReimportKjv = (): void => {
    if (reimporting()) return;
    setReimporting(true);
    void runtime
      .runPromise(
        Effect.gen(function* () {
          const svc = yield* KjvBible;
          yield* svc.reimport();
        }),
      )
      .then(() => {
        setLoadNonce((n) => n + 1);
      })
      .catch((err: unknown) => {
        setLoad({
          _tag: 'error',
          message: err instanceof Error ? err.message : 'Reimport failed.',
        });
      })
      .finally(() => {
        setReimporting(false);
      });
  };

  const cursorVerse = createMemo(() => {
    const sel = selection();
    return Option.isSome(sel) ? Option.getOrNull(sel.value.verse) : null;
  });

  // Prev/next chapter — walk within the current book; cross book boundaries
  // when at the first/last chapter (Genesis 1 has no prev, Revelation 22 no
  // next). Returns the target {book, chapter} or null at the edges.
  type Loc = { readonly book: number; readonly chapter: number; readonly label: string };
  const adjacentChapter = (direction: -1 | 1): Loc | null => {
    const sel = Option.getOrNull(selection());
    if (sel === null) return null;
    const book = getBibleBook(sel.book);
    if (!book) return null;
    const nextChapter = sel.chapter + direction;
    if (nextChapter >= 1 && nextChapter <= book.chapters) {
      return {
        book: sel.book,
        chapter: nextChapter,
        label: formatBibleReference({ book: sel.book, chapter: nextChapter }),
      };
    }
    // Cross book boundary.
    const adjBookNum = sel.book + direction;
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
    void selection();
    return adjacentChapter(-1);
  });
  const nextLoc = createMemo<Loc | null>(() => {
    void selection();
    return adjacentChapter(1);
  });
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

  // Adjacent-chapter preload — warms the KjvBible LRU + EgwCommentary cache
  // for prev/next so the next nav resolves synchronously with no
  // "Loading…" flash. Best-effort; failures are swallowed.
  createEffect(() => {
    const prev = prevLoc();
    const next = nextLoc();
    const warm = (loc: Loc | null): void => {
      if (loc === null) return;
      void runtime.runPromise(
        Effect.gen(function* () {
          const svc = yield* KjvBible;
          yield* svc.getChapter(loc.book, loc.chapter);
        }),
      );
      void runtime.runPromise(
        Effect.gen(function* () {
          const c = yield* EgwCommentary;
          yield* c.versesWithCommentary(loc.book, loc.chapter);
        }),
      );
    };
    warm(prev);
    warm(next);
  });
  // Chapter options for the centered picker — every chapter in the current
  // book, keyed `${book}:${ch}` so a single onPick callback can decode both.
  const chapterOptions = createMemo<readonly { readonly value: string; readonly label: string }[]>(
    () => {
      const sel = Option.getOrNull(selection());
      if (sel === null) return [];
      const book = getBibleBook(sel.book);
      if (!book) return [];
      const out: { readonly value: string; readonly label: string }[] = [];
      for (let i = 1; i <= book.chapters; i++) {
        out.push({
          value: `${String(sel.book)}:${String(i)}`,
          label: formatBibleReference({ book: sel.book, chapter: i }),
        });
      }
      return out;
    },
  );
  // Cmd/Ctrl + arrow jumps to the first/last chapter of the current book
  // (stays within the book — no cross-book transition).
  const goFirst = (): void => {
    const sel = Option.getOrNull(selection());
    if (sel === null) return;
    if (sel.chapter === 1) return;
    goTo({
      book: sel.book,
      chapter: 1,
      label: formatBibleReference({ book: sel.book, chapter: 1 }),
    });
  };
  const goLast = (): void => {
    const sel = Option.getOrNull(selection());
    if (sel === null) return;
    const book = getBibleBook(sel.book);
    if (!book) return;
    if (sel.chapter === book.chapters) return;
    goTo({
      book: sel.book,
      chapter: book.chapters,
      label: formatBibleReference({ book: sel.book, chapter: book.chapters }),
    });
  };

  // Arrow-key navigation. Skip when focus is in an editable field so typing
  // search doesn't paginate. Cmd/Ctrl + arrow jumps to the first/last chapter
  // of the current book.
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

  const titleFor = (sel: Option.Option<BibleReaderSelection>): string | null => {
    const s = Option.getOrNull(sel);
    if (s === null) return null;
    const book = getBibleBook(s.book);
    if (!book) return `${String(s.book)} ${String(s.chapter)}`;
    return formatBibleReference({ book: s.book, chapter: s.chapter });
  };

  return (
    <div class="h-full overflow-y-auto">
      <Show when={Option.isSome(selection())}>
        <ChapterNavButtons
          prevTitle={() => prevLoc()?.label ?? undefined}
          nextTitle={() => nextLoc()?.label ?? undefined}
          onPrev={goPrev}
          onNext={goNext}
          options={chapterOptions}
          current={() => {
            const sel = Option.getOrNull(selection());
            return sel === null ? undefined : `${String(sel.book)}:${String(sel.chapter)}`;
          }}
          onPick={(value) => {
            const [bStr, cStr] = value.split(':');
            if (bStr === undefined || cStr === undefined) return;
            const b = Number(bStr);
            const c = Number(cStr);
            if (!Number.isFinite(b) || !Number.isFinite(c)) return;
            goTo({ book: b, chapter: c, label: formatBibleReference({ book: b, chapter: c }) });
          }}
        />
      </Show>
      <Switch>
        <Match when={load()._tag === 'loading'}>
          <div class="mx-auto max-w-[var(--reader-width,68ch)] px-6 py-10">
            <ReaderHeader
              title={titleFor(selection())}
              commentaryOpen={props.commentaryOpen}
              onToggleCommentary={props.onToggleCommentary}
            />
            <p class="mt-6 text-ui-sm text-muted">Loading…</p>
          </div>
        </Match>
        <Match when={load()._tag === 'missing'}>
          <div class="mx-auto max-w-[var(--reader-width,68ch)] px-6 py-10">
            <ReaderHeader
              title={titleFor(selection())}
              commentaryOpen={props.commentaryOpen}
              onToggleCommentary={props.onToggleCommentary}
            />
            <p class="mt-6 text-ui-sm text-fg">
              Chapter not found. The bundled KJV database may be incomplete — a previous import
              probably crashed mid-write.
            </p>
            <p class="mt-2 text-ui-sm text-muted">
              Reimport the bundled KJV verses + Strong's lexicon to repopulate the table. Takes a
              few seconds.
            </p>
            <button
              type="button"
              class="mt-4 inline-flex items-center gap-1.5 h-[calc(32px*var(--ui-scale))] px-4 rounded-md border border-rule bg-accent text-bg text-ui-sm font-medium cursor-pointer transition-[background,border-color,opacity] duration-[0.12s] ease-in-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-wait"
              disabled={reimporting()}
              onClick={onReimportKjv}
            >
              {reimporting() ? 'Reimporting…' : 'Reimport KJV'}
            </button>
          </div>
        </Match>
        <Match when={errorLoad()} keyed>
          {(err) => (
            <div class="mx-auto max-w-[var(--reader-width,68ch)] px-6 py-10">
              <ReaderHeader
                title={titleFor(selection())}
                commentaryOpen={props.commentaryOpen}
                onToggleCommentary={props.onToggleCommentary}
              />
              <p class="mt-6 text-ui-sm text-muted">Failed to load chapter — {err.message}</p>
            </div>
          )}
        </Match>
        <Match when={readyChapter()} keyed>
          {(chapter) => (
            <div class="mx-auto max-w-[var(--reader-width,68ch)] px-6 py-10">
              <ReaderHeader
                title={`${chapter.bookName} ${String(chapter.chapter)}`}
                commentaryOpen={props.commentaryOpen}
                onToggleCommentary={props.onToggleCommentary}
              />
              <ChapterBody
                chapter={chapter}
                cursorVerse={cursorVerse()}
                commentaryVerses={commentaryVerses()}
                verseRefs={verseRefs}
                onVerseClick={onVerseClick}
                onCommentaryClick={onCommentaryClick}
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

const ReaderHeader: Component<{
  readonly title: string | null;
  readonly commentaryOpen: boolean;
  readonly onToggleCommentary: () => void;
}> = (props) => (
  <Show when={props.title}>
    {(t) => (
      <div class="flex items-center justify-between gap-3">
        <h1 class="m-0 text-ui-2xl font-semibold tracking-[-0.005em] text-fg">{t()}</h1>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 h-[calc(28px*var(--ui-scale))] px-3 rounded-md border border-rule bg-transparent text-fg text-ui-sm cursor-pointer transition-[background,border-color,color] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] hover:border-accent hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:border-accent focus-visible:outline-none data-active:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] data-active:border-accent"
          data-active={props.commentaryOpen ? '' : undefined}
          onClick={props.onToggleCommentary}
          title="EGW commentary on current verse"
          aria-label="Toggle EGW commentary"
          aria-pressed={props.commentaryOpen}
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
          >
            <path d="M4 5h11v14H4z" />
            <path d="M15 9h5v10h-5z" />
          </svg>
          <span>Commentary</span>
        </button>
      </div>
    )}
  </Show>
);

const ChapterBody: Component<{
  readonly chapter: KjvChapter;
  readonly cursorVerse: number | null;
  readonly commentaryVerses: ReadonlySet<number>;
  readonly verseRefs: Map<number, HTMLElement>;
  readonly onVerseClick: (verse: number) => void;
  readonly onCommentaryClick: (verse: number) => void;
}> = (props) => (
  <>
    <div class="mt-6 flex flex-col gap-3 font-[family-name:var(--reader-font-family,var(--font-serif))] text-[length:var(--reader-font-size,18px)] leading-[var(--reader-line-height,1.55)] text-fg">
      <For each={props.chapter.verses}>
        {(v) => {
          const isCursor = (): boolean => v.verse === props.cursorVerse;
          const hasCommentary = (): boolean => props.commentaryVerses.has(v.verse);
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
              <Show when={hasCommentary()}>
                <button
                  type="button"
                  class="mr-1 cursor-pointer bg-transparent border-0 p-0 align-baseline text-[0.62em] font-medium text-accent opacity-70 hover:opacity-100 hover:underline select-none"
                  title={`EGW commentary on verse ${String(v.verse)}`}
                  onClick={() => props.onCommentaryClick(v.verse)}
                >
                  <sup>e</sup>
                </button>
              </Show>
              <VerseRenderer text={v.text} />
            </p>
          );
        }}
      </For>
    </div>
  </>
);
