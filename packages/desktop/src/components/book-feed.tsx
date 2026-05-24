import { type EGWApiClientError, type Schemas } from '@bible/core/egw';
import { Effect, Option, Result } from 'effect';
import {
  type Accessor,
  type Component,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  Show,
} from 'solid-js';
import { runtime } from '../runtime.js';
import { EGWData } from '../services/egw-data.js';
import { ReaderState } from '../services/reader-state.js';
import { ParagraphView } from './paragraph-view.js';

// Module-scoped in-renderer chapter LRU. Survives BookFeed remounts (which
// happen on every chapter swap via the keyed <Show> in ReaderPane), so
// adjacent-chapter preloads we kicked off from the previous mount can serve
// the next render synchronously — no "Loading chapter…" flicker on
// prev/next nav. Capped to keep memory bounded across long reading sessions.
const CHAPTER_CACHE_CAP = 24;
const chapterCache = new Map<string, readonly Schemas.Paragraph[]>();
const chapterKey = (bookId: number, paraId: string): string => `${String(bookId)}:${paraId}`;
const cacheGet = (bookId: number, paraId: string): readonly Schemas.Paragraph[] | undefined => {
  const k = chapterKey(bookId, paraId);
  const v = chapterCache.get(k);
  if (v === undefined) return undefined;
  // LRU touch — re-insert moves to the back.
  chapterCache.delete(k);
  chapterCache.set(k, v);
  return v;
};
const cachePut = (
  bookId: number,
  paraId: string,
  paragraphs: readonly Schemas.Paragraph[],
): void => {
  const k = chapterKey(bookId, paraId);
  chapterCache.delete(k);
  chapterCache.set(k, paragraphs);
  while (chapterCache.size > CHAPTER_CACHE_CAP) {
    const oldest = chapterCache.keys().next().value;
    if (oldest === undefined) break;
    chapterCache.delete(oldest);
  }
};
// In-flight dedupe so adjacent-preload + a user click for the same chapter
// don't double up the IPC round-trip.
const inFlight = new Map<string, Promise<void>>();
const preloadChapter = async (bookId: number, paraId: string): Promise<void> => {
  const k = chapterKey(bookId, paraId);
  if (chapterCache.has(k)) return;
  const existing = inFlight.get(k);
  if (existing !== undefined) return existing;
  const p = runtime
    .runPromise(
      Effect.gen(function* () {
        const data = yield* EGWData;
        return yield* data.getChapterByParaId(bookId, paraId);
      }).pipe(Effect.result),
    )
    .then((res) => {
      if (Result.isSuccess(res)) cachePut(bookId, paraId, res.success);
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

// Single-chapter book reader. Was previously a virtualized continuous-scroll
// feed across all chapters; we ripped that out because the prepend/expand
// machinery fought itself (post-mutation geometry being mistaken for user
// intent → unbounded backward expansion). One chapter mounted at a time is
// simpler and matches the way the data actually wants to be paginated.
//
// Navigation:
//   • TOC click sets ReaderState.chapterParaId (parent remounts via keyed Show)
//   • Bottom-corner prev/next buttons + ←/→ arrow keys jump to the adjacent
//     chapter using the book's TOC for ordering. Keys ignored when focus is in
//     an editable field.

export interface BookFeedProps {
  readonly bookId: number;
  readonly chapterParaId: string;
  readonly scrollEl: Accessor<HTMLElement | undefined>;
  readonly highlightParaId?: Accessor<Option.Option<string>>;
  readonly onHighlightApplied?: () => void;
  readonly restoreParagraphId?: Accessor<Option.Option<string>>;
  readonly onPositionChange?: (chapterParaId: string, paragraphParaId: string) => void;
  readonly fontFamily?: Accessor<string>;
  readonly onScriptureClick?: (title: string) => void;
}

interface NavItem extends Schemas.TocItem {
  readonly para_id: string;
}

export const BookFeed: Component<BookFeedProps> = (props) => {
  const [toc] = createResource(
    () => props.bookId,
    (bookId) =>
      runtime.runPromise(
        Effect.gen(function* () {
          const data = yield* EGWData;
          return yield* data.getToc(bookId);
        }).pipe(Effect.result),
      ),
  );

  const navItems = createMemo<readonly NavItem[]>(() => {
    const t = toc();
    if (t === undefined) return [];
    if (Result.isFailure(t)) return [];
    return t.success.filter(
      (i): i is NavItem => i.para_id !== undefined && i.para_id !== null && i.para_id !== '',
    );
  });

  const currentNav = createMemo<NavItem | undefined>(() =>
    navItems().find((n) => n.para_id === props.chapterParaId),
  );

  const currentIdx = createMemo(() =>
    navItems().findIndex((n) => n.para_id === props.chapterParaId),
  );

  const prevChapter = createMemo<NavItem | undefined>(() => {
    const idx = currentIdx();
    if (idx <= 0) return undefined;
    return navItems()[idx - 1];
  });

  const nextChapter = createMemo<NavItem | undefined>(() => {
    const idx = currentIdx();
    const items = navItems();
    if (idx < 0 || idx >= items.length - 1) return undefined;
    return items[idx + 1];
  });

  // Seed initial paragraphs from the shared module-level LRU so a cache-warm
  // chapter renders synchronously on first paint with no loading fallback.
  // The createResource still runs on cache miss / cold first-visit.
  const cached = cacheGet(props.bookId, props.chapterParaId);
  const [cachedParagraphs, setCachedParagraphs] = createSignal<
    readonly Schemas.Paragraph[] | undefined
  >(cached);

  type ChapterResult = Result.Result<readonly Schemas.Paragraph[], EGWApiClientError>;
  const [chapter] = createResource<
    ChapterResult,
    { readonly bookId: number; readonly paraId: string }
  >(
    () => ({ bookId: props.bookId, paraId: props.chapterParaId }),
    ({ bookId, paraId }) => {
      const hit = cacheGet(bookId, paraId);
      if (hit !== undefined) {
        setCachedParagraphs(hit);
        return Promise.resolve(Result.succeed(hit) as ChapterResult);
      }
      return runtime
        .runPromise(
          Effect.gen(function* () {
            const data = yield* EGWData;
            return yield* data.getChapterByParaId(bookId, paraId);
          }).pipe(Effect.result),
        )
        .then((res) => {
          if (Result.isSuccess(res)) cachePut(bookId, paraId, res.success);
          return res;
        });
    },
  );

  const paragraphs = createMemo<readonly Schemas.Paragraph[]>(() => {
    const c = chapter();
    if (c !== undefined) {
      if (Result.isFailure(c)) return [];
      return c.success;
    }
    return cachedParagraphs() ?? [];
  });

  // Preload adjacent chapters into the shared LRU so the next prev/next
  // navigation renders synchronously. Fires whenever the prev/next memos
  // resolve (i.e. after the TOC loads and on every chapter swap).
  createEffect(() => {
    const bookId = props.bookId;
    const p = prevChapter();
    const n = nextChapter();
    if (p !== undefined) void preloadChapter(bookId, p.para_id);
    if (n !== undefined) void preloadChapter(bookId, n.para_id);
  });

  const [flashingParaId, setFlashingParaId] = createSignal<string | undefined>(undefined);
  const [appliedHighlightId, setAppliedHighlightId] = createSignal<string | undefined>(undefined);

  const paragraphRefs = new Map<string, HTMLElement>();

  // After paragraphs render, apply the one-shot scroll cues:
  //   • highlightParaId — search-jump landing, scroll-to + flash + clear
  //   • restoreParagraphId — silent scroll restore on first render
  // Each runs once per (chapter, target) tuple to avoid re-scrolling when
  // the chapter re-renders for unrelated reasons.
  createEffect(() => {
    const highlight = props.highlightParaId?.();
    if (highlight === undefined || Option.isNone(highlight)) {
      setAppliedHighlightId(undefined);
      return;
    }
    const target = highlight.value;
    if (appliedHighlightId() === target) return;
    if (paragraphs().length === 0) return;
    const el = paragraphRefs.get(target);
    if (el === undefined) return;
    setAppliedHighlightId(target);
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    setFlashingParaId(target);
    const t = window.setTimeout(() => {
      setFlashingParaId((curr) => (curr === target ? undefined : curr));
      props.onHighlightApplied?.();
    }, 1200);
    onCleanup(() => window.clearTimeout(t));
  });

  const [appliedRestoreId, setAppliedRestoreId] = createSignal<string | undefined>(undefined);
  createEffect(() => {
    const restore = props.restoreParagraphId?.();
    if (restore === undefined || Option.isNone(restore)) return;
    const target = restore.value;
    if (appliedRestoreId() === target) return;
    if (paragraphs().length === 0) return;
    const el = paragraphRefs.get(target);
    if (el === undefined) return;
    setAppliedRestoreId(target);
    el.scrollIntoView({ block: 'start', behavior: 'auto' });
  });

  // Reset scroll to top when the chapter changes (keyed remount handles most
  // cases, but if the parent reuses us, we want a fresh start).
  createEffect(() => {
    // Track chapter change
    void props.chapterParaId;
    const el = props.scrollEl();
    if (el === undefined) return;
    el.scrollTop = 0;
  });

  // Scroll-spy: report the topmost visible paragraph + current chapter on every
  // scroll event. Used by the parent to persist the user's reading position.
  const reportPosition = (): void => {
    const cb = props.onPositionChange;
    if (cb === undefined) return;
    const el = props.scrollEl();
    if (el === undefined) return;
    const top = el.getBoundingClientRect().top;
    let topmost: string | undefined;
    for (const [paraId, paraEl] of paragraphRefs) {
      const r = paraEl.getBoundingClientRect();
      if (r.bottom > top) {
        topmost = paraId;
        break;
      }
    }
    if (topmost === undefined) return;
    cb(props.chapterParaId, topmost);
  };
  createEffect(() => {
    const el = props.scrollEl();
    if (el === undefined) return;
    el.addEventListener('scroll', reportPosition, { passive: true });
    onCleanup(() => el.removeEventListener('scroll', reportPosition));
  });

  const navigateTo = (paraId: string): void => {
    void runtime.runPromise(
      Effect.gen(function* () {
        const state = yield* ReaderState;
        yield* state.openChapter(props.bookId, paraId);
      }),
    );
  };

  const goPrev = (): void => {
    const p = prevChapter();
    if (p !== undefined) navigateTo(p.para_id);
  };
  const goNext = (): void => {
    const n = nextChapter();
    if (n !== undefined) navigateTo(n.para_id);
  };
  const goFirst = (): void => {
    const first = navItems()[0];
    if (first !== undefined && first.para_id !== props.chapterParaId) navigateTo(first.para_id);
  };
  const goLast = (): void => {
    const items = navItems();
    const last = items[items.length - 1];
    if (last !== undefined && last.para_id !== props.chapterParaId) navigateTo(last.para_id);
  };

  // Arrow-key navigation. Ignored when focus is in an editable surface
  // (input, textarea, contenteditable) so typing search doesn't paginate.
  // Cmd/Ctrl + left/right jumps to the first/last chapter.
  // Cmd/Ctrl + up/down jumps to the start/end of the current chapter.
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
    } else if (jumpToEdge && e.key === 'ArrowUp') {
      const el = props.scrollEl();
      if (el === undefined) return;
      e.preventDefault();
      el.scrollTop = 0;
    } else if (jumpToEdge && e.key === 'ArrowDown') {
      const el = props.scrollEl();
      if (el === undefined) return;
      e.preventDefault();
      el.scrollTop = el.scrollHeight;
    }
  };
  createEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  return (
    <article class="w-[min(var(--reader-width,68ch),100%)] font-[family-name:var(--reader-font-family,var(--font-serif))]">
      <Show
        when={!toc.loading}
        fallback={<p class="m-0 py-8 text-center text-ui-sm text-muted">Loading book…</p>}
      >
        <Show
          when={navItems().length > 0}
          fallback={
            <p class="m-0 py-8 text-center text-ui-sm text-[#b3261e]">Failed to load contents.</p>
          }
        >
          <Show when={currentNav()} keyed>
            {(nav) => (
              <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-4 pt-12 pb-8">
                <span class="h-px bg-rule" aria-hidden="true" />
                <h2 class="m-0 font-[family-name:var(--font-serif)] text-[length:calc(var(--reader-font-size,18px)*1.2)] font-medium tracking-[0.01em] text-fg text-center">
                  {nav.title}
                </h2>
                <span class="h-px bg-rule" aria-hidden="true" />
              </div>
            )}
          </Show>
          <Show
            when={!chapter.loading || paragraphs().length > 0}
            fallback={<p class="m-0 py-8 text-center text-ui-sm text-muted">Loading chapter…</p>}
          >
            <Show
              when={paragraphs().length > 0}
              fallback={
                <p class="m-0 py-8 text-center text-ui-sm text-[#b3261e]">
                  Failed to load chapter.
                </p>
              }
            >
              <For each={paragraphs()}>
                {(paragraph) => (
                  <ParagraphRow
                    paragraph={paragraph}
                    flashing={
                      paragraph.para_id !== null &&
                      paragraph.para_id !== undefined &&
                      flashingParaId() === paragraph.para_id
                    }
                    registerRef={(el) => {
                      const id = paragraph.para_id;
                      if (id === null || id === undefined) return;
                      paragraphRefs.set(id, el);
                    }}
                    onScriptureClick={props.onScriptureClick}
                  />
                )}
              </For>
            </Show>
          </Show>
        </Show>
      </Show>

      <div aria-hidden="true" style={{ height: '50vh' }} />

      <ChapterNavButtons
        prevTitle={() => prevChapter()?.title ?? undefined}
        nextTitle={() => nextChapter()?.title ?? undefined}
        onPrev={goPrev}
        onNext={goNext}
        options={() => navItems().map((n) => ({ value: n.para_id, label: n.title ?? n.para_id }))}
        current={() => props.chapterParaId}
        onPick={(paraId) => navigateTo(paraId)}
      />
    </article>
  );
};

const ParagraphRow: Component<{
  readonly paragraph: Schemas.Paragraph;
  readonly flashing: boolean;
  readonly registerRef: (el: HTMLElement) => void;
  readonly onScriptureClick?: (title: string) => void;
}> = (props) => {
  const refcode = (): string | undefined => {
    const r = props.paragraph.refcode_short;
    return r === null || r === undefined || r === '' ? undefined : r;
  };
  return (
    <p
      class="m-0 -mx-1 rounded mb-[1em] px-1 font-[family-name:var(--reader-font-family,var(--font-serif))] text-[length:var(--reader-font-size,18px)] leading-[var(--reader-line-height,1.55)] [letter-spacing:var(--reader-letter-spacing,0)] text-fg transition-[background] duration-[0.4s] ease-in-out data-[flash=true]:bg-accent-soft"
      data-para-id={props.paragraph.para_id ?? undefined}
      data-flash={props.flashing ? 'true' : undefined}
      ref={(el) => props.registerRef(el)}
    >
      <ParagraphView
        nodes={props.paragraph.nodes}
        onLinkClick={(_dataLink, kind, title) => {
          if (kind === 'scripture') props.onScriptureClick?.(title);
        }}
      />
      <Show when={refcode()}>
        {(r) => (
          <span
            class="ml-2 text-[0.78em] text-muted opacity-70 [font-variant-numeric:tabular-nums] select-none"
            aria-label="paragraph reference"
          >
            {r()}
          </span>
        )}
      </Show>
    </p>
  );
};

export interface ChapterOption {
  readonly value: string;
  readonly label: string;
}

// Centered floating chapter nav: [← Prev] [chapter <select>] [Next →] pinned
// to the bottom-center of the viewport. Renders for both readers; the EGW
// reader keys options by chapter para_id, the Bible reader by `${book}:${ch}`.
export const ChapterNavButtons: Component<{
  readonly prevTitle: () => string | undefined;
  readonly nextTitle: () => string | undefined;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly options: () => readonly ChapterOption[];
  readonly current: () => string | undefined;
  readonly onPick: (value: string) => void;
}> = (props) => (
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-full border border-rule bg-bg/85 backdrop-blur px-1.5 py-1 shadow-sm">
    <button
      type="button"
      class="inline-flex items-center justify-center h-8 w-8 rounded-full text-fg cursor-pointer transition-[background,opacity] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30 disabled:cursor-default disabled:pointer-events-none"
      disabled={props.prevTitle() === undefined}
      onClick={props.onPrev}
      aria-label={`Previous chapter${props.prevTitle() ? ` — ${props.prevTitle() ?? ''}` : ''}`}
      title={props.prevTitle() ?? 'Previous chapter'}
    >
      <span aria-hidden="true">←</span>
    </button>
    <ChapterSelect options={props.options} current={props.current} onPick={props.onPick} />
    <button
      type="button"
      class="inline-flex items-center justify-center h-8 w-8 rounded-full text-fg cursor-pointer transition-[background,opacity] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-30 disabled:cursor-default disabled:pointer-events-none"
      disabled={props.nextTitle() === undefined}
      onClick={props.onNext}
      aria-label={`Next chapter${props.nextTitle() ? ` — ${props.nextTitle() ?? ''}` : ''}`}
      title={props.nextTitle() ?? 'Next chapter'}
    >
      <span aria-hidden="true">→</span>
    </button>
  </div>
);

const ChapterSelect: Component<{
  readonly options: () => readonly ChapterOption[];
  readonly current: () => string | undefined;
  readonly onPick: (value: string) => void;
}> = (props) => {
  const currentLabel = (): string | undefined => {
    const cur = props.current();
    if (cur === undefined) return undefined;
    return props.options().find((o) => o.value === cur)?.label;
  };
  return (
    <div class="relative inline-flex items-center rounded-full transition-[background] duration-[0.12s] hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-accent">
      <span class="pointer-events-none px-3 text-ui-sm text-fg max-w-[20ch] truncate">
        {currentLabel() ?? '—'}
      </span>
      <span class="pointer-events-none pr-2 text-ui-xs text-muted" aria-hidden="true">
        ▾
      </span>
      <select
        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer focus:outline-none"
        value={props.current() ?? ''}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (v !== '' && v !== props.current()) props.onPick(v);
        }}
        aria-label="Pick a chapter"
      >
        <For each={props.options()}>{(opt) => <option value={opt.value}>{opt.label}</option>}</For>
      </select>
    </div>
  );
};
