import { type Schemas } from '@bible/core/egw';
import { Effect, Exit, Option } from 'effect';
import {
  type Accessor,
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { makeLru } from '../lib/lru.js';
import { ipc, runtime } from '../runtime.js';
import { EGWData } from '../services/egw-data.js';
import { ReaderState } from '../services/reader-state.js';
import { ParagraphView } from './paragraph-view.js';

// Module-scoped in-renderer chapter LRU. Survives BookFeed remounts (which
// happen on every chapter swap via the keyed <Show> in ReaderPane), so
// adjacent-chapter preloads we kicked off from the previous mount can serve
// the next render synchronously — no "Loading chapter…" flicker on
// prev/next nav. Capped to keep memory bounded across long reading sessions.
const CHAPTER_CACHE_CAP = 24;
const chapterCache = makeLru<readonly Schemas.Paragraph[]>(CHAPTER_CACHE_CAP);
const chapterKey = (bookId: number, paraId: string): string => `${String(bookId)}:${paraId}`;
const cacheGet = (bookId: number, paraId: string): readonly Schemas.Paragraph[] | undefined =>
  chapterCache.get(chapterKey(bookId, paraId));
const cachePut = (
  bookId: number,
  paraId: string,
  paragraphs: readonly Schemas.Paragraph[],
): void => {
  chapterCache.set(chapterKey(bookId, paraId), paragraphs);
};
// In-flight dedupe so adjacent-preload + a user click for the same chapter
// don't double up the IPC round-trip.
const inFlight = new Map<string, Promise<void>>();
const preloadChapter = async (bookId: number, paraId: string): Promise<void> => {
  const k = chapterKey(bookId, paraId);
  if (chapterCache.has(k)) return;
  const existing = inFlight.get(k);
  if (existing !== undefined) return existing;
  // Preload reads the underlying service rather than subscribing through the
  // ipc proxy — proxy reads require a Solid tracking scope, and we want to
  // warm the LRU from a `createEffect` that's already tracked for prev/next
  // rather than create a phantom subscription.
  const p = runtime
    .runPromiseExit(
      Effect.gen(function* () {
        const data = yield* EGWData;
        return yield* data.getChapterByParaId(bookId, paraId);
      }),
    )
    .then((exit) => {
      if (Exit.isSuccess(exit)) cachePut(bookId, paraId, exit.value);
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
  readonly onParagraphScrolledIntoView?: (chapterParaId: string, paragraphParaId: string) => void;
  readonly fontFamily?: Accessor<string>;
  readonly onScriptureClick?: (title: string) => void;
}

interface NavItem extends Schemas.TocItem {
  readonly para_id: string;
}

// Chapter-data hook: owns IPC + LRU mirror + adjacent preloads. Returns the
// paragraphs accessor (cache-peek-first so warm prev/next renders without
// triggering Suspense) plus the nav lookups derived off the book's TOC.
interface ChapterDataApi {
  readonly paragraphs: Accessor<readonly Schemas.Paragraph[]>;
  readonly navItems: Accessor<readonly NavItem[]>;
  readonly currentNav: Accessor<NavItem | undefined>;
  readonly prevChapter: Accessor<NavItem | undefined>;
  readonly nextChapter: Accessor<NavItem | undefined>;
}
const useChapterData = (props: {
  readonly bookId: number;
  readonly chapterParaId: string;
}): ChapterDataApi => {
  const toc = ipc.egw.getToc.query(() => ({ bookId: props.bookId }));
  const navItems = createMemo<readonly NavItem[]>(() => {
    const t = toc();
    if (t === undefined) return [];
    return t.filter(
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

  const chapter = ipc.egw.getChapterByParaId.query(() => ({
    bookId: props.bookId,
    paraId: props.chapterParaId,
  }));
  // Mirror successful reads into the renderer-level LRU so adjacent preloads
  // and warm remounts have a synchronous data source. The ipc registry caches
  // the resource itself, but reading the resource still goes through Suspense
  // on first paint per (bookId, paraId); the LRU short-circuits that on
  // reopen-in-session.
  createEffect(() => {
    const c = chapter();
    if (c === undefined) return;
    cachePut(props.bookId, props.chapterParaId, c);
  });
  const paragraphs = createMemo<readonly Schemas.Paragraph[]>(() => {
    const hit = cacheGet(props.bookId, props.chapterParaId);
    if (hit !== undefined) return hit;
    const c = chapter();
    return c ?? [];
  });
  // Preload adjacent chapters into the shared LRU so next prev/next nav
  // renders synchronously. Fires when prev/next resolve (TOC load, chapter swap).
  createEffect(() => {
    const bookId = props.bookId;
    const p = prevChapter();
    const n = nextChapter();
    if (p !== undefined) void preloadChapter(bookId, p.para_id);
    if (n !== undefined) void preloadChapter(bookId, n.para_id);
  });

  return { paragraphs, navItems, currentNav, prevChapter, nextChapter };
};

// Highlight + restore hook. Two one-shot scroll cues with different lifecycles:
//   • highlight — search-jump landing: scroll-to + flash + clear-on-applied
//   • restore   — silent scroll restore: scroll-to once, never flashes
// `flashing(paraId)` tells the renderer which paragraph (if any) currently
// owns the flash animation.
const useChapterHighlight = (props: {
  readonly paragraphs: Accessor<readonly Schemas.Paragraph[]>;
  readonly paragraphRefs: Map<string, HTMLElement>;
  readonly highlightParaId?: Accessor<Option.Option<string>>;
  readonly restoreParagraphId?: Accessor<Option.Option<string>>;
  readonly onHighlightApplied?: () => void;
}): { readonly flashing: (paraId: string | null | undefined) => boolean } => {
  type HighlightState =
    | { readonly _tag: 'idle' }
    | { readonly _tag: 'flashing'; readonly paraId: string }
    | { readonly _tag: 'applied'; readonly paraId: string };
  const [highlightState, setHighlightState] = createSignal<HighlightState>({ _tag: 'idle' });

  createEffect(() => {
    const highlight = props.highlightParaId?.();
    if (highlight === undefined || Option.isNone(highlight)) {
      setHighlightState({ _tag: 'idle' });
      return;
    }
    const target = highlight.value;
    const curr = highlightState();
    if (curr._tag !== 'idle' && curr.paraId === target) return;
    if (props.paragraphs().length === 0) return;
    const el = props.paragraphRefs.get(target);
    if (el === undefined) return;
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    setHighlightState({ _tag: 'flashing', paraId: target });
    const t = window.setTimeout(() => {
      setHighlightState((s) =>
        s._tag === 'flashing' && s.paraId === target ? { _tag: 'applied', paraId: target } : s,
      );
      props.onHighlightApplied?.();
    }, 1200);
    onCleanup(() => window.clearTimeout(t));
  });

  // Restore is its own one-shot: different input, lands on a different paraId,
  // and never flashes. Keeping it independent of the highlight union.
  const [appliedRestoreId, setAppliedRestoreId] = createSignal<string | undefined>(undefined);
  createEffect(() => {
    const restore = props.restoreParagraphId?.();
    if (restore === undefined || Option.isNone(restore)) return;
    const target = restore.value;
    if (appliedRestoreId() === target) return;
    if (props.paragraphs().length === 0) return;
    const el = props.paragraphRefs.get(target);
    if (el === undefined) return;
    setAppliedRestoreId(target);
    el.scrollIntoView({ block: 'start', behavior: 'auto' });
  });

  return {
    flashing: (paraId) => {
      if (paraId === null || paraId === undefined) return false;
      const s = highlightState();
      return s._tag === 'flashing' && s.paraId === paraId;
    },
  };
};

// Scroll-spy hook: reports the topmost visible paragraph + scroll percentage
// on every scroll event. The 50vh tail spacer is excluded from the denom so
// reaching the last paragraph reads as 100%, not ~67%.
const useChapterScrollSpy = (props: {
  readonly scrollEl: Accessor<HTMLElement | undefined>;
  readonly chapterParaId: string;
  readonly paragraphRefs: Map<string, HTMLElement>;
  readonly onParagraphScrolledIntoView?: (chapterParaId: string, paragraphParaId: string) => void;
}): Accessor<number> => {
  const [scrollPct, setScrollPct] = createSignal(0);
  const onScroll = (): void => {
    const el = props.scrollEl();
    if (el === undefined) return;
    const top = el.getBoundingClientRect().top;
    let topmost: string | undefined;
    let lastParaBottom = 0;
    for (const [paraId, paraEl] of props.paragraphRefs) {
      const r = paraEl.getBoundingClientRect();
      if (topmost === undefined && r.bottom > top) {
        topmost = paraId;
      }
      if (r.bottom > lastParaBottom) lastParaBottom = r.bottom;
    }
    const lastParaBottomInScroll = lastParaBottom - top + el.scrollTop;
    const denom = Math.max(1, lastParaBottomInScroll - el.clientHeight);
    const pct = Math.max(0, Math.min(100, Math.round((el.scrollTop / denom) * 100)));
    setScrollPct(pct);
    const cb = props.onParagraphScrolledIntoView;
    if (cb !== undefined && topmost !== undefined) cb(props.chapterParaId, topmost);
  };
  createEffect(() => {
    const el = props.scrollEl();
    if (el === undefined) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    onCleanup(() => el.removeEventListener('scroll', onScroll));
  });
  // Reset scroll to top + pct to 0 on chapter swap. The keyed remount handles
  // most cases, but if the parent reuses us we want a fresh start. `on(...
  // defer: true)` skips the initial run since the signal is already 0.
  createEffect(() => {
    void props.chapterParaId;
    const el = props.scrollEl();
    if (el === undefined) return;
    el.scrollTop = 0;
  });
  createEffect(
    on(
      () => props.chapterParaId,
      () => setScrollPct(0),
      { defer: true },
    ),
  );
  return scrollPct;
};

// Keyboard-nav hook: arrow keys paginate chapters, Cmd/Ctrl-modified jumps to
// first/last chapter or top/bottom of the current scroll element. Ignored
// when focus is in an editable surface (typing search doesn't paginate).
const useChapterKeyboardNav = (props: {
  readonly scrollEl: Accessor<HTMLElement | undefined>;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onFirst: () => void;
  readonly onLast: () => void;
}): void => {
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
      if (jumpToEdge) props.onFirst();
      else props.onPrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (jumpToEdge) props.onLast();
      else props.onNext();
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
  onMount(() => {
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });
};

export const BookFeed: Component<BookFeedProps> = (props) => {
  const { paragraphs, navItems, currentNav, prevChapter, nextChapter } = useChapterData({
    get bookId() {
      return props.bookId;
    },
    get chapterParaId() {
      return props.chapterParaId;
    },
  });

  const navOptions = createMemo(() =>
    navItems().map((n) => ({ value: n.para_id, label: n.title ?? n.para_id })),
  );

  const paragraphRefs = new Map<string, HTMLElement>();

  const { flashing } = useChapterHighlight({
    paragraphs,
    paragraphRefs,
    highlightParaId: props.highlightParaId,
    restoreParagraphId: props.restoreParagraphId,
    onHighlightApplied: props.onHighlightApplied,
  });

  const scrollPct = useChapterScrollSpy({
    scrollEl: props.scrollEl,
    get chapterParaId() {
      return props.chapterParaId;
    },
    paragraphRefs,
    onParagraphScrolledIntoView: props.onParagraphScrolledIntoView,
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

  useChapterKeyboardNav({
    scrollEl: props.scrollEl,
    onPrev: goPrev,
    onNext: goNext,
    onFirst: goFirst,
    onLast: goLast,
  });

  return (
    <article class="w-[min(var(--reader-width,68ch),100%)] font-[family-name:var(--reader-font-family,var(--font-serif))]">
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
      <For each={paragraphs()}>
        {(paragraph) => (
          <ParagraphRow
            paragraph={paragraph}
            flashing={flashing(Option.getOrUndefined(paragraph.para_id))}
            registerRef={(el) => {
              const id = Option.getOrUndefined(paragraph.para_id);
              if (id === undefined) return;
              paragraphRefs.set(id, el);
            }}
            onScriptureClick={props.onScriptureClick}
          />
        )}
      </For>

      <div aria-hidden="true" style={{ height: '50vh' }} />

      <ReadingProgressIndicator pct={scrollPct} />

      <ChapterNavButtons
        prevTitle={() => prevChapter()?.title ?? undefined}
        nextTitle={() => nextChapter()?.title ?? undefined}
        onPrev={goPrev}
        onNext={goNext}
        options={navOptions}
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
  const refcode = (): string | undefined => Option.getOrUndefined(props.paragraph.refcode_short);
  return (
    <p
      class="m-0 -mx-1 rounded mb-[1em] px-1 font-[family-name:var(--reader-font-family,var(--font-serif))] text-[length:var(--reader-font-size,18px)] leading-[var(--reader-line-height,1.55)] [letter-spacing:var(--reader-letter-spacing,0)] text-fg transition-[background] duration-[0.4s] ease-in-out data-[flash=true]:bg-accent-soft"
      data-para-id={Option.getOrUndefined(props.paragraph.para_id)}
      data-flash={props.flashing ? 'true' : undefined}
      ref={(el) => props.registerRef(el)}
    >
      <ParagraphView
        nodes={props.paragraph.nodes}
        onReferenceActivated={(_dataLink, kind, title) => {
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

// Tiny pill in the bottom-right with the user's progress through the current
// chapter as a percentage. Matches ChapterNavButtons' visual language so the
// two floating elements feel like one toolbar.
const ReadingProgressIndicator: Component<{
  readonly pct: () => number;
}> = (props) => (
  <div
    class="fixed bottom-6 right-6 z-10 rounded-full border border-rule bg-bg/85 backdrop-blur px-3 py-1 shadow-sm text-ui-xs tabular-nums text-muted select-none"
    aria-label={`Chapter progress ${String(props.pct())}%`}
    title={`${String(props.pct())}% through chapter`}
  >
    {props.pct()}%
  </div>
);

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
