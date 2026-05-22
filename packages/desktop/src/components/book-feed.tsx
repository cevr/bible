import { type EGWApiClientError, nodesToText, type Schemas } from '@bible/core/egw';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { Effect, Option, Result } from 'effect';
import {
  type Accessor,
  type Component,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
} from 'solid-js';
import { runtime } from '../runtime.js';
import { EGWData } from '../services/egw-data.js';
import { estimateParagraphHeight, type ReaderMetrics } from '../services/paragraph-estimator.js';
import { ParagraphView } from './paragraph-view.js';
import { ReaderRuler } from './reader-ruler.js';

// Continuous chapter feed for one book.
//
// Replaces the page-style ChapterContent. Instead of mounting one chapter at a
// time with prev/next buttons, the user scrolls through all chapters in a
// single virtualized list. The window is bounded:
//
//   • current chapter ± K (K=1) chapters are *mounted* — their content lives
//     in the flat item array passed to the virtualizer.
//   • Everything else is implicit: the prefetcher (concurrency 8) warms the
//     cache for the rest of the book in the background, so when the window
//     expands toward a new chapter the resource fetch is usually a no-op sqlite
//     read.
//
// Window expansion: when the user scrolls within the last/first mounted
// chapter's range, we bump endChapIdx / startChapIdx. The expansion is driven
// by a separate effect (driven by visible indices) rather than by IntersectionObserver
// because the virtualizer already gives us startIndex/endIndex of visible
// items, which we can map back to chapter boundaries cheaply.
//
// Each paragraph carries `data-chapter-para-id` so the upcoming scroll-spy
// (task #70) can attribute viewport position to a chapter without a separate
// per-chapter wrapper element.

const WINDOW_HALF = 1; // mount current ± 1 chapters

export interface BookFeedProps {
  readonly bookId: number;
  readonly chapterParaId: string;
  readonly scrollEl: Accessor<HTMLElement | undefined>;
  /** Optional paragraph to scroll-to + briefly flash. Set by search-result
      clicks via ReaderState.openChapterAt. The feed clears it once applied. */
  readonly highlightParaId?: Accessor<Option.Option<string>>;
  /** Called after the highlight has been scrolled into view and flashed,
      so the parent can clear ReaderState.highlightParaId. */
  readonly onHighlightApplied?: () => void;
  /** Paragraph paraId to silently scroll to on first appearance — used for
      restoring the user's last reading position. Unlike highlightParaId, no
      flash and consumed only once per mount (we don't re-scroll if the user
      scrolls away). */
  readonly restoreParagraphId?: Accessor<Option.Option<string>>;
  /** Fired whenever scroll-spy resolves a new (chapter, topmost-paragraph)
      pair. Debounced internally. Used to persist the user's reading position. */
  readonly onPositionChange?: (chapterParaId: string, paragraphParaId: string) => void;
  /** Current reader font-family token. Threaded through so the metrics probe
      can re-sample when the user swaps fonts — pretext height predictions are
      keyed by font, and stale predictions cause paragraph overlap. */
  readonly fontFamily?: Accessor<string>;
  /** Called with the human-readable title of a ScriptureRef when the user
      clicks one (e.g. "Genesis 3:1"). The app shell opens its Bible drawer
      with that query. Omit to leave scripture links inert. */
  readonly onScriptureClick?: (title: string) => void;
}

interface NavItem extends Schemas.TocItem {
  readonly para_id: string;
}

// Flat virtualizer item — either a chapter break header or a paragraph row.
type FeedItem =
  | { readonly _tag: 'Break'; readonly chapterParaId: string; readonly title: string }
  | { readonly _tag: 'Para'; readonly chapterParaId: string; readonly paragraph: Schemas.Paragraph }
  | {
      readonly _tag: 'Loading';
      readonly chapterParaId: string;
    };

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

  // The "starting" chapter — set by the parent (TOC nav click, search-jump).
  // After mount, scroll-spy takes over and the displayed "current chapter"
  // comes from activeChapterIdx instead.
  const startingIdx = createMemo(() =>
    navItems().findIndex((i) => i.para_id === props.chapterParaId),
  );

  // Window bounds — start at current ± K, grow only (callers reset by remounting).
  const [startIdx, setStartIdx] = createSignal(0);
  const [endIdx, setEndIdx] = createSignal(0);

  // When the starting chapter changes (TOC nav click, search-jump), recenter
  // the window. We don't shrink it — keeping previously-mounted chapters lets
  // the user scroll back without re-fetching, and the items are already
  // measured by the virtualizer.
  createEffect(
    on([startingIdx, () => navItems().length], ([idx, total]) => {
      if (idx < 0 || total === 0) return;
      const desiredStart = Math.max(0, idx - WINDOW_HALF);
      const desiredEnd = Math.min(total - 1, idx + WINDOW_HALF);
      setStartIdx((curr) =>
        Math.min(curr === 0 && endIdx() === 0 ? desiredStart : curr, desiredStart),
      );
      setEndIdx((curr) => Math.max(curr, desiredEnd));
    }),
  );

  // The mounted chapter slice — what we actually fetch + render.
  const mounted = createMemo<readonly NavItem[]>(() => {
    const items = navItems();
    if (items.length === 0) return [];
    const s = startIdx();
    const e = endIdx();
    if (e < s) return [];
    return items.slice(s, e + 1);
  });

  // Fetch each mounted chapter. Map keyed by paraId so we keep stable
  // results across window expansions (no re-fetch when start/end widen).
  // Value is Option:
  //   • absent key      → not yet kicked off
  //   • Option.none     → fetch in flight
  //   • Option.some(r)  → resolved (Result.Success or Result.Failure)
  type ChapterResult = Result.Result<readonly Schemas.Paragraph[], EGWApiClientError>;
  const [chapters, setChapters] = createSignal<ReadonlyMap<string, Option.Option<ChapterResult>>>(
    new Map(),
  );

  createEffect(() => {
    const items = mounted();
    if (items.length === 0) return;
    const bookId = props.bookId;
    setChapters((prev) => {
      const next = new Map(prev);
      for (const item of items) {
        if (next.has(item.para_id)) continue;
        // Mark in-flight so the next createEffect run doesn't double-fetch.
        next.set(item.para_id, Option.none());
        void runtime
          .runPromise(
            Effect.gen(function* () {
              const data = yield* EGWData;
              return yield* data.getChapterByParaId(bookId, item.para_id);
            }).pipe(Effect.result),
          )
          .then((res) => {
            setChapters((cur) => {
              const updated = new Map(cur);
              updated.set(item.para_id, Option.some(res));
              return updated;
            });
          });
      }
      return next;
    });
  });

  // Flatten mounted chapters into the virtualizer's flat item list.
  // Loading chapters contribute a single Loading placeholder so the
  // virtualizer reserves layout space and the user sees progress per
  // chapter (rather than a spinner over the whole feed).
  const items = createMemo<readonly FeedItem[]>(() => {
    const out: FeedItem[] = [];
    const ch = chapters();
    for (const navItem of mounted()) {
      out.push({
        _tag: 'Break',
        chapterParaId: navItem.para_id,
        title: navItem.title ?? '',
      });
      const entry = ch.get(navItem.para_id);
      if (entry === undefined || Option.isNone(entry)) {
        out.push({ _tag: 'Loading', chapterParaId: navItem.para_id });
        continue;
      }
      const res = entry.value;
      if (Result.isFailure(res)) {
        out.push({ _tag: 'Loading', chapterParaId: navItem.para_id });
        continue;
      }
      for (const paragraph of res.success) {
        out.push({ _tag: 'Para', chapterParaId: navItem.para_id, paragraph });
      }
    }
    return out;
  });

  // Reader text metrics, derived from the rendered <article> + first paragraph.
  // Used by pretext to predict paragraph heights without touching the DOM.
  // Stays undefined until the article ref attaches and we can sample
  // getComputedStyle. While undefined, estimateSize falls back to a fixed
  // guess; the moment metrics resolve, the effect below invalidates the
  // virtualizer's cached sizes so estimates pick up the pretext predictions.
  const [articleEl, setArticleEl] = createSignal<HTMLElement | undefined>(undefined);
  const [metrics, setMetrics] = createSignal<ReaderMetrics | undefined>(undefined);

  // Plain-text cache per paragraph — nodesToText() runs the AST flatten once
  // per paragraph; pretext caches the prepared handle separately keyed by
  // (text, font).
  const paragraphText = new Map<string, string>();
  const getParagraphText = (paragraph: Schemas.Paragraph, fallbackKey: string): string => {
    const key = paragraph.para_id ?? fallbackKey;
    const cached = paragraphText.get(key);
    if (cached !== undefined) return cached;
    const text = nodesToText(paragraph.nodes);
    paragraphText.set(key, text);
    return text;
  };

  // Virtualizer. The scroll element is the .reader pane provided by the
  // parent — `scrollEl()` returns undefined until the ref attaches, so we
  // guard with a placeholder estimateSize and rely on measureElement for
  // dynamic heights once the row renders.
  const virtualizer = createVirtualizer({
    get count() {
      return items().length;
    },
    getScrollElement: () => props.scrollEl() ?? null,
    estimateSize: (index) => {
      const item = items()[index];
      if (item === undefined) return 120;
      const m = metrics();
      if (item._tag === 'Break') return m?.breakHeightPx ?? 140;
      if (item._tag === 'Loading') return m?.loadingHeightPx ?? 90;
      if (m === undefined) return 140;
      const text = getParagraphText(item.paragraph, `${item.chapterParaId}#${String(index)}`);
      return estimateParagraphHeight(text, m);
    },
    overscan: 6,
    getItemKey: (index) => {
      const item = items()[index];
      if (item === undefined) return index;
      if (item._tag === 'Break') return `break:${item.chapterParaId}`;
      if (item._tag === 'Loading') return `loading:${item.chapterParaId}`;
      return `para:${item.paragraph.para_id ?? `${item.chapterParaId}#${String(index)}`}`;
    },
  });

  // Dev-only canary: catches "feed has items but virtualizer renders zero rows"
  // — the failure mode that hid the scrollEl rAF race for weeks. If items show
  // up but the virtualizer's scroll rect is still 0×0 after two animation
  // frames, something upstream broke the layout/measurement contract.
  if (import.meta.env?.DEV) {
    createEffect(() => {
      const itemCount = items().length;
      if (itemCount === 0) return;
      let f1: number | undefined;
      let f2: number | undefined;
      f1 = requestAnimationFrame(() => {
        f2 = requestAnimationFrame(() => {
          const visible = virtualizer.getVirtualItems().length;
          if (visible !== 0) return;
          const sEl = props.scrollEl();
          // eslint-disable-next-line no-console
          console.warn(
            '[BookFeed canary] items().length > 0 but getVirtualItems()===[] after 2 frames — virtualizer likely never measured its scroll element',
            {
              itemCount,
              scrollEl: sEl ? { w: sEl.clientWidth, h: sEl.clientHeight } : null,
              totalSize: virtualizer.getTotalSize(),
            },
          );
        });
      });
      onCleanup(() => {
        if (f1 !== undefined) cancelAnimationFrame(f1);
        if (f2 !== undefined) cancelAnimationFrame(f2);
      });
    });
  }

  // Reader metrics come from a DOM probe — a hidden block mounted inside the
  // article that renders one of each row type (Para, Break, Loading) using the
  // same classes as the real rows. We measure those clones, not the article
  // wrapper, so the numbers reflect what paragraphs actually do: the reader
  // font (not the article font), the real available width after horizontal
  // padding, the real line-height, and real Break/Loading row heights. The
  // probe is removed immediately after sampling.
  //
  // We wait for document.fonts.ready before the first sample so canvas glyph
  // measurement (inside pretext) sees the loaded reader font, not the fallback.
  // ResizeObserver re-samples on width changes (sidebar toggle, window resize,
  // reader-width slider). Same probe is rebuilt each time — it's a few DOM
  // nodes and a layout flush; not on a hot path.
  const sampleMetrics = (article: HTMLElement): void => {
    // Width must match the article's content box exactly so paragraph
    // measurements wrap at the same width real rows will. We size the probe
    // explicitly (rather than width:100%) because position:absolute makes
    // % widths resolve against the nearest positioned ancestor — which is
    // <main> (absolutely positioned), not <article>. That mismatch caused
    // pretext to predict 1280px-wide single-line paragraphs while real rows
    // wrap at ~1067px, yielding ~4× height underestimates.
    const articleContentWidthPx = article.clientWidth;
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = `position:absolute;left:0;top:-99999px;width:${String(articleContentWidthPx)}px;visibility:hidden;pointer-events:none;`;
    const para = document.createElement('p');
    para.className =
      'm-0 -mx-1 rounded mb-[1em] px-1 font-[family-name:var(--reader-font-family,var(--font-serif))] text-[length:var(--reader-font-size,18px)] leading-[var(--reader-line-height,1.55)] [letter-spacing:var(--reader-letter-spacing,0)] text-fg';
    // One word so the probe occupies exactly one line — gives us a baseline
    // single-line height we can compare against pretext's predictions.
    para.textContent = 'M';
    const brk = document.createElement('div');
    brk.className = 'grid grid-cols-[1fr_auto_1fr] items-center gap-4 pt-12 pb-8';
    const brkRule1 = document.createElement('span');
    brkRule1.className = 'h-px bg-rule';
    const brkTitle = document.createElement('h2');
    brkTitle.className =
      'm-0 font-[family-name:var(--font-serif)] text-[length:calc(var(--reader-font-size,18px)*1.2)] font-medium tracking-[0.01em] text-fg text-center';
    brkTitle.textContent = 'Chapter';
    const brkRule2 = document.createElement('span');
    brkRule2.className = 'h-px bg-rule';
    brk.append(brkRule1, brkTitle, brkRule2);
    const loading = document.createElement('p');
    loading.className = 'm-0 py-8 text-center text-ui-sm text-muted';
    loading.textContent = 'Loading chapter…';
    probe.append(para, brk, loading);
    article.appendChild(probe);

    const paraStyles = window.getComputedStyle(para);
    const fontSize = paraStyles.fontSize; // already in px
    const fontFamily = paraStyles.fontFamily;
    const fontSizePx = Number.parseFloat(fontSize);
    const fontWeight = paraStyles.fontWeight;
    const fontStyle = paraStyles.fontStyle;
    // Canvas font shorthand: `<style> <weight> <size> <family>`. Including
    // style+weight matters when emphasis/strong inflate widths; we use the
    // paragraph default (regular) since most text is regular.
    const font = `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
    const lineHeightRaw = paraStyles.lineHeight;
    const lineHeightPx =
      lineHeightRaw === 'normal'
        ? fontSizePx * 1.2
        : Number.parseFloat(lineHeightRaw) || fontSizePx * 1.55;
    const paddingLeftPx = Number.parseFloat(paraStyles.paddingLeft) || 0;
    const paddingRightPx = Number.parseFloat(paraStyles.paddingRight) || 0;
    const paddingTopPx = Number.parseFloat(paraStyles.paddingTop) || 0;
    const paddingBottomPx = Number.parseFloat(paraStyles.paddingBottom) || 0;
    const marginBottomPx = Number.parseFloat(paraStyles.marginBottom) || 0;
    const widthPx = para.clientWidth - paddingLeftPx - paddingRightPx;
    const verticalPadPx = paddingTopPx + paddingBottomPx + marginBottomPx;
    const breakHeightPx = brk.getBoundingClientRect().height;
    const loadingHeightPx = loading.getBoundingClientRect().height;

    article.removeChild(probe);

    const next: ReaderMetrics = {
      font,
      widthPx,
      lineHeightPx,
      verticalPadPx,
      breakHeightPx,
      loadingHeightPx,
    };
    const prev = metrics();
    if (
      prev !== undefined &&
      prev.font === next.font &&
      prev.widthPx === next.widthPx &&
      prev.lineHeightPx === next.lineHeightPx &&
      prev.verticalPadPx === next.verticalPadPx &&
      prev.breakHeightPx === next.breakHeightPx &&
      prev.loadingHeightPx === next.loadingHeightPx
    ) {
      return;
    }
    setMetrics(next);
    virtualizer.measure();
  };

  createEffect(() => {
    const el = articleEl();
    if (el === undefined) return;
    // Track fontFamily so this effect re-runs when the user swaps fonts —
    // pretext's predicted heights are keyed by the canvas font shorthand, so
    // a stale sample after a font change paints rows that overlap.
    props.fontFamily?.();
    // Wait for web fonts before first sample so canvas glyph metrics match
    // the rendered text. Subsequent samples (ResizeObserver) don't need the
    // wait — fonts have already loaded by then.
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    const initial =
      fonts !== undefined && typeof fonts.ready?.then === 'function'
        ? fonts.ready.then(() => {
            sampleMetrics(el);
          })
        : Promise.resolve().then(() => {
            sampleMetrics(el);
          });
    void initial;
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => sampleMetrics(el));
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  });

  // Expand the window when the user scrolls into the last/first mounted
  // chapter. We read getVirtualItems()'s endIndex/startIndex, find the chapter
  // they belong to, and bump bounds if the user is within the edge chapter.
  createEffect(() => {
    const visible = virtualizer.getVirtualItems();
    if (visible.length === 0) return;
    const flat = items();
    const last = visible[visible.length - 1];
    const first = visible[0];
    if (last === undefined || first === undefined) return;
    const lastItem = flat[last.index];
    const firstItem = flat[first.index];
    const nav = navItems();
    const total = nav.length;

    if (lastItem !== undefined) {
      const idx = nav.findIndex((n) => n.para_id === lastItem.chapterParaId);
      if (idx >= 0 && idx >= endIdx() && idx < total - 1) {
        setEndIdx(Math.min(total - 1, idx + 1));
      }
    }
    if (firstItem !== undefined) {
      const idx = nav.findIndex((n) => n.para_id === firstItem.chapterParaId);
      if (idx >= 0 && idx <= startIdx() && idx > 0) {
        setStartIdx(Math.max(0, idx - 1));
      }
    }
  });

  // Search-jump highlight. When `highlightParaId` is set, we wait until the
  // matching paragraph appears in the flat `items()` array (its chapter has
  // loaded), then scroll to it, set a flash flag, clear after a beat, and
  // tell the parent to clear the highlight on ReaderState.
  //
  // We track `appliedHighlightId` so the same highlight doesn't fire twice
  // (e.g. when items() re-renders for other reasons). Cleared whenever the
  // upstream highlight changes.
  const [flashingParaId, setFlashingParaId] = createSignal<string | undefined>(undefined);
  const [appliedHighlightId, setAppliedHighlightId] = createSignal<string | undefined>(undefined);

  createEffect(() => {
    const highlight = props.highlightParaId?.();
    if (highlight === undefined || Option.isNone(highlight)) {
      setAppliedHighlightId(undefined);
      return;
    }
    const targetParaId = highlight.value;
    if (appliedHighlightId() === targetParaId) return;
    const flat = items();
    const targetIdx = flat.findIndex(
      (it) => it._tag === 'Para' && it.paragraph.para_id === targetParaId,
    );
    if (targetIdx < 0) return; // chapter hasn't loaded yet; effect re-runs when items() updates
    setAppliedHighlightId(targetParaId);
    virtualizer.scrollToIndex(targetIdx, { align: 'center' });
    setFlashingParaId(targetParaId);
    const clearTimer = window.setTimeout(() => {
      setFlashingParaId((curr) => (curr === targetParaId ? undefined : curr));
      props.onHighlightApplied?.();
    }, 1200);
    onCleanup(() => window.clearTimeout(clearTimer));
  });

  // Scroll-spy: track the scroll position so we can attribute the viewport
  // to a chapter and compute that chapter's scroll fraction. rAF-coalesced
  // so we read scrollTop at most once per frame.
  const [scrollTop, setScrollTop] = createSignal(0);
  let rafPending = false;
  let boundScrollEl: HTMLElement | undefined;
  const onScroll = (): void => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const el = props.scrollEl();
      if (el === undefined) return;
      setScrollTop(el.scrollTop);
    });
  };
  createEffect(() => {
    const el = props.scrollEl();
    if (el === boundScrollEl) return;
    if (boundScrollEl !== undefined) {
      boundScrollEl.removeEventListener('scroll', onScroll);
    }
    boundScrollEl = el;
    if (el !== undefined) {
      el.addEventListener('scroll', onScroll, { passive: true });
      setScrollTop(el.scrollTop);
    }
  });
  onCleanup(() => {
    if (boundScrollEl !== undefined) boundScrollEl.removeEventListener('scroll', onScroll);
  });

  // Per-chapter pixel ranges, derived from Break item positions in the
  // virtualizer. We rebuild whenever items() changes (mounted set grows) or
  // when virtualizer measurements change (paragraphs settle their real size).
  //
  // Each entry: { paraId, startOffset, endOffset }. endOffset of the last
  // chapter is totalSize. Chapters with un-mounted breaks are skipped.
  const chapterRanges = createMemo<
    ReadonlyArray<{ readonly paraId: string; readonly start: number; readonly end: number }>
  >(() => {
    // Tracked to re-run on measurement updates — getVirtualItems() and
    // getTotalSize() both read from the same measurements pipeline.
    virtualizer.getVirtualItems();
    const total = virtualizer.getTotalSize();
    const flat = items();
    const breaks: Array<{ index: number; paraId: string; start: number }> = [];
    for (let i = 0; i < flat.length; i++) {
      const item = flat[i];
      if (item === undefined || item._tag !== 'Break') continue;
      const offset = virtualizer.getOffsetForIndex(i, 'start');
      if (offset === undefined) continue;
      breaks.push({ index: i, paraId: item.chapterParaId, start: offset[0] });
    }
    return breaks.map((b, i) => ({
      paraId: b.paraId,
      start: b.start,
      end: i + 1 < breaks.length ? (breaks[i + 1]?.start ?? total) : total,
    }));
  });

  // Active chapter — last range whose start ≤ scrollTop + a small bias so
  // the next chapter "wins" when its break crosses the top of the viewport.
  const VIEWPORT_BIAS = 12;
  const activeChapterParaId = createMemo<string | undefined>(() => {
    const ranges = chapterRanges();
    if (ranges.length === 0) return undefined;
    const y = scrollTop() + VIEWPORT_BIAS;
    let active = ranges[0]?.paraId;
    for (const r of ranges) {
      if (r.start <= y) active = r.paraId;
      else break;
    }
    return active;
  });

  const activeChapterIdx = createMemo(() => {
    const paraId = activeChapterParaId();
    if (paraId === undefined) return -1;
    return navItems().findIndex((n) => n.para_id === paraId);
  });

  // Scroll fraction within the active chapter — 0 when its break is at the
  // top of the viewport, 1 when the user has scrolled past the chapter's end.
  // We subtract clientHeight so 1.0 lines up with "last paragraph fully read"
  // rather than "chapter end is at the bottom of the viewport, half its
  // content still on screen."
  const chapterFraction = createMemo<number>(() => {
    const paraId = activeChapterParaId();
    if (paraId === undefined) return 0;
    const range = chapterRanges().find((r) => r.paraId === paraId);
    if (range === undefined) return 0;
    const el = props.scrollEl();
    const clientH = el?.clientHeight ?? 0;
    const span = Math.max(1, range.end - range.start - clientH);
    const within = scrollTop() - range.start;
    if (within <= 0) return 0;
    if (within >= span) return 1;
    return within / span;
  });

  // Topmost visible Para item — the paragraph anchor we persist as "where the
  // user was last reading." Picked from getVirtualItems(): the first Para
  // whose bottom edge (start + size) is below the viewport top. Falls back
  // to the first visible Para if none qualify (initial paint, edge cases).
  const topmostParagraphId = createMemo<string | undefined>(() => {
    const visible = virtualizer.getVirtualItems();
    if (visible.length === 0) return undefined;
    const flat = items();
    const y = scrollTop();
    let fallback: string | undefined;
    for (const vr of visible) {
      const item = flat[vr.index];
      if (item === undefined || item._tag !== 'Para') continue;
      const paraId = item.paragraph.para_id;
      if (paraId === null || paraId === undefined) continue;
      if (fallback === undefined) fallback = paraId;
      if (vr.start + vr.size > y) return paraId;
    }
    return fallback;
  });

  // Persist (chapter, paragraph) anchor whenever scroll-spy resolves a new
  // pair. Debounced so flicks across the page don't write per-frame; 250ms
  // matches typical "the user has stopped scrolling" pause.
  const POSITION_DEBOUNCE_MS = 250;
  createEffect(() => {
    const cb = props.onPositionChange;
    if (cb === undefined) return;
    const chapter = activeChapterParaId();
    const para = topmostParagraphId();
    if (chapter === undefined || para === undefined) return;
    const timer = window.setTimeout(() => {
      cb(chapter, para);
    }, POSITION_DEBOUNCE_MS);
    onCleanup(() => window.clearTimeout(timer));
  });

  // One-shot restore: when restoreParagraphId is Some, scroll to that
  // paragraph as soon as it appears in items(). We track applied IDs so a
  // remount of the same chapter doesn't re-trigger, and the effect cleans up
  // once consumed (no re-scrolling after the user scrolls away).
  const [appliedRestoreId, setAppliedRestoreId] = createSignal<string | undefined>(undefined);
  createEffect(() => {
    const restore = props.restoreParagraphId?.();
    if (restore === undefined || Option.isNone(restore)) return;
    const targetParaId = restore.value;
    if (appliedRestoreId() === targetParaId) return;
    const flat = items();
    const targetIdx = flat.findIndex(
      (it) => it._tag === 'Para' && it.paragraph.para_id === targetParaId,
    );
    if (targetIdx < 0) return; // wait for chapter to load
    setAppliedRestoreId(targetParaId);
    virtualizer.scrollToIndex(targetIdx, { align: 'start' });
  });

  return (
    <article
      class="w-[min(var(--reader-width,68ch),100%)] font-[family-name:var(--reader-font-family,var(--font-serif))]"
      ref={setArticleEl}
    >
      <ReaderRuler
        chapterFraction={chapterFraction}
        currentIndex={activeChapterIdx}
        totalChapters={() => navItems().length}
      />
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
          <div
            class="relative w-full"
            style={{
              height: `${String(virtualizer.getTotalSize())}px`,
            }}
          >
            <For each={virtualizer.getVirtualItems()}>
              {(virtualRow) => {
                const item = (): FeedItem | undefined =>
                  virtualRow ? items()[virtualRow.index] : undefined;
                return (
                  <div
                    class="absolute top-0 left-0 w-full"
                    ref={(el) => {
                      // TanStack reads data-index synchronously via indexFromElement
                      // when measureElement runs. Solid's reactive attribute/style
                      // bindings fire *after* the ref callback, so on initial mount
                      // they haven't committed yet. We set both data-index and the
                      // transform imperatively here, and keep them in sync via
                      // createEffect for when reconcile-by-index reuses this DOM
                      // node for a different virtualRow (same element, new logical
                      // row — the declarative bindings race against the next
                      // measure pass and can leave a stale-translate frame).
                      //
                      // Defensive: under store reconcile churn (window expand,
                      // chapter swap), <For>'s iteratee can briefly hand us an
                      // undefined virtualRow before the next pass replaces it.
                      // Skip those frames — measureElement on a partial row would
                      // just feed bad cache anyway.
                      if (!virtualRow) return;
                      el.setAttribute('data-index', String(virtualRow.index));
                      el.style.transform = `translateY(${String(virtualRow.start)}px)`;
                      createEffect(() => {
                        if (!virtualRow) return;
                        el.setAttribute('data-index', String(virtualRow.index));
                        el.style.transform = `translateY(${String(virtualRow.start)}px)`;
                      });
                      virtualizer.measureElement(el);
                    }}
                  >
                    <Show when={item()} keyed>
                      {(i) => (
                        <FeedRow
                          item={i}
                          flashing={
                            i._tag === 'Para' &&
                            i.paragraph.para_id !== null &&
                            i.paragraph.para_id !== undefined &&
                            flashingParaId() === i.paragraph.para_id
                          }
                          onScriptureClick={props.onScriptureClick}
                        />
                      )}
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </Show>
    </article>
  );
};

const FeedRow: Component<{
  readonly item: FeedItem;
  readonly flashing: boolean;
  readonly onScriptureClick?: (title: string) => void;
}> = (props) => {
  if (props.item._tag === 'Break') {
    return (
      <div
        class="grid grid-cols-[1fr_auto_1fr] items-center gap-4 pt-12 pb-8"
        data-chapter-para-id={props.item.chapterParaId}
      >
        <span class="h-px bg-rule" aria-hidden="true" />
        <h2 class="m-0 font-[family-name:var(--font-serif)] text-[length:calc(var(--reader-font-size,18px)*1.2)] font-medium tracking-[0.01em] text-fg text-center">
          {props.item.title}
        </h2>
        <span class="h-px bg-rule" aria-hidden="true" />
      </div>
    );
  }
  if (props.item._tag === 'Loading') {
    return (
      <p
        class="m-0 py-8 text-center text-ui-sm text-muted"
        data-chapter-para-id={props.item.chapterParaId}
      >
        Loading chapter…
      </p>
    );
  }
  const paragraph = props.item.paragraph;
  const nodes = createMemo(() => paragraph.nodes);
  const refcode = (): string | undefined => {
    const r = paragraph.refcode_short;
    return r === null || r === undefined || r === '' ? undefined : r;
  };
  return (
    <p
      class="m-0 -mx-1 rounded mb-[1em] px-1 font-[family-name:var(--reader-font-family,var(--font-serif))] text-[length:var(--reader-font-size,18px)] leading-[var(--reader-line-height,1.55)] [letter-spacing:var(--reader-letter-spacing,0)] text-fg transition-[background] duration-[0.4s] ease-in-out data-[flash=true]:bg-accent-soft"
      data-para-id={paragraph.para_id ?? undefined}
      data-chapter-para-id={props.item.chapterParaId}
      data-flash={props.flashing ? 'true' : undefined}
    >
      <ParagraphView
        nodes={nodes()}
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
