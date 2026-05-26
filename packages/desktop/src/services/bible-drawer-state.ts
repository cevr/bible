import { parseBibleQuery, type ParsedBibleQuery } from '@bible/core/bible-reader';
import { Effect, Option } from 'effect';
import { type Accessor, createSignal } from 'solid-js';
import { runtime } from '../runtime.js';
import { KjvBible, type KjvChapter, type KjvStrongsChapter } from './kjv-bible.js';

// Drawer status. The "loading" / "error" / "not-found" cases all let the UI
// stay open with a helpful inline message instead of slamming shut on the
// user. "not-found" specifically covers parse failures (the link's title
// isn't a recognizable Bible reference) and unknown chapters.
export type BibleDrawerStatus =
  | { readonly _tag: 'idle' }
  | { readonly _tag: 'loading'; readonly query: string }
  | {
      readonly _tag: 'ready';
      readonly query: string;
      readonly parsed: ParsedBibleQuery;
      readonly chapter: KjvChapter;
      /** Populated when strongs mode is on AND the strongs IPC succeeded.
       *  We always load the plain chapter so the drawer has something to
       *  render if the strongs JSON is missing or fails. */
      readonly strongs: Option.Option<KjvStrongsChapter>;
      readonly highlight: readonly number[];
    }
  | { readonly _tag: 'not-found'; readonly query: string; readonly reason: string }
  | { readonly _tag: 'error'; readonly query: string; readonly message: string };

/** Study-pane tab keys. `notes` covers margin notes for the active verse;
 *  the rest mirror the web study sheet's tab order. Cross-refs and EGW
 *  panels are placeholders today — they render an empty state until their
 *  data sources land. */
export type BibleStudyTab = 'notes' | 'strongs' | 'xrefs' | 'egw';

/** Drawer body view machine. `reader` is the chapter pane (default); the
 *  TOC views replace the chapter pane in-place so the drawer doesn't grow
 *  a separate overlay. `book-toc` shows chapters for a *browsed* book —
 *  not necessarily the chapter the user is currently reading — so the user
 *  can scan another book without leaving their place. Selecting a chapter
 *  loads it and snaps back to `reader`. */
export type BibleDrawerView =
  | { readonly _tag: 'reader' }
  | { readonly _tag: 'books-toc' }
  | { readonly _tag: 'book-toc'; readonly book: number };

/** Focus carried into the study pane when the user clicks a margin-note
 *  anchor, a Strong's superscript, or (eventually) a cross-reference link.
 *  Acts as a hint to the pane about what to scroll to / highlight. */
export type StudyPaneFocus =
  | { readonly _tag: 'none' }
  | { readonly _tag: 'note'; readonly verse: number; readonly noteIndex: number }
  | { readonly _tag: 'strongs'; readonly verse: number; readonly code: string }
  | { readonly _tag: 'xref'; readonly verse: number }
  | { readonly _tag: 'egw'; readonly verse: number };

export interface BibleDrawerState {
  readonly isOpen: Accessor<boolean>;
  readonly status: Accessor<BibleDrawerStatus>;
  readonly strongsEnabled: Accessor<boolean>;
  /** Whether the drawer is showing only the chapter pane (false) or the
   *  expanded shell with the study pane visible (true). */
  readonly isExpanded: Accessor<boolean>;
  /** Active study tab when expanded. Always defined, even while collapsed
   *  — preserves the user's last selection across collapse/expand toggles. */
  readonly activeStudyTab: Accessor<BibleStudyTab>;
  /** What (if anything) the study pane should focus on. */
  readonly studyFocus: Accessor<StudyPaneFocus>;
  /** Active body view — chapter reader or one of the TOC steps. The current
   *  chapter (if any) stays loaded behind the TOC views, so `backToReader`
   *  drops the user right back where they were. */
  readonly view: Accessor<BibleDrawerView>;
  /** Optional reader-side "cursor" — the verse the user is focusing on via
   *  j/k keyboard nav. Independent of the parsed-query highlight set so
   *  navigating with the keys doesn't fight with the original "Matt 5:3" range
   *  the drawer opened on. Rendered with the same highlight style. */
  readonly cursorVerse: Accessor<number | null>;
  readonly open: (query: string) => void;
  readonly navigate: (book: number, chapter: number) => void;
  readonly close: () => void;
  readonly setStrongsEnabled: (enabled: boolean) => void;
  readonly setExpanded: (expanded: boolean) => void;
  readonly setActiveStudyTab: (tab: BibleStudyTab) => void;
  /** Auto-expands the drawer, switches to the right tab, and stores a focus
   *  hint for the pane to act on. Convenience wrapper for click handlers
   *  on inline verse decorations (margin notes, Strong's, xrefs). */
  readonly openStudyTab: (tab: BibleStudyTab, focus?: StudyPaneFocus) => void;
  /** Open the drawer pinned to a specific (book, chapter) and immediately
   *  surface a study tab on a given verse. Used by inline overlays in the
   *  main Bible canvas — they already know the chapter, so we bypass the
   *  parsed-query path and load the chapter directly. */
  readonly openAt: (
    book: number,
    chapter: number,
    tab: BibleStudyTab,
    focus: StudyPaneFocus,
  ) => void;
  /** Switch the body to the books TOC. If a chapter is currently loaded,
   *  the picker pre-highlights that book so `g` round-trips feel anchored. */
  readonly openBooksToc: () => void;
  /** Switch the body to the chapter picker for a specific book. The book
   *  doesn't have to be the currently-loaded one — that's the point: the
   *  user can browse a different book without committing to it yet. */
  readonly openBookToc: (book: number) => void;
  /** Return to the chapter reader, preserving whatever chapter was last
   *  loaded. If no chapter has been loaded, stays in the TOC. */
  readonly backToReader: () => void;
  /** Move the cursor one verse forward or backward inside the current
   *  chapter. Clamps to chapter bounds. No-op if no chapter is loaded. */
  readonly moveCursor: (delta: 1 | -1) => void;
}

/** Computes the set of verses to highlight from a parsed reference. Chapter-
 *  only references highlight nothing (drawer just scrolls to verse 1). */
const highlightFor = (parsed: ParsedBibleQuery): readonly number[] => {
  if (parsed._tag === 'single') {
    return parsed.ref.verse !== undefined ? [parsed.ref.verse] : [];
  }
  if (parsed._tag === 'verseRange') {
    const out: number[] = [];
    for (let v = parsed.startVerse; v <= parsed.endVerse; v++) out.push(v);
    return out;
  }
  return [];
};

/** Picks the (book, chapter) target out of the parsed query. Returns None
 *  for queries the drawer can't render (full-book lookups, free-text search,
 *  chapter ranges). The caller surfaces those as `not-found` so the user sees
 *  why the drawer didn't load anything. */
const targetChapter = (
  parsed: ParsedBibleQuery,
): Option.Option<{ readonly book: number; readonly chapter: number }> => {
  switch (parsed._tag) {
    case 'single':
      return Option.some({ book: parsed.ref.book, chapter: parsed.ref.chapter });
    case 'chapter':
      return Option.some({ book: parsed.book, chapter: parsed.chapter });
    case 'verseRange':
      return Option.some({ book: parsed.book, chapter: parsed.chapter });
    case 'chapterRange':
      return Option.some({ book: parsed.book, chapter: parsed.startChapter });
    case 'fullBook':
      return Option.some({ book: parsed.book, chapter: 1 });
    case 'search':
      return Option.none();
  }
};

/** Module-singleton drawer. The drawer is global UI — one at a time — so we
 *  keep its state outside any component to avoid prop-drilling and to make
 *  click handlers in deep paragraph rows trivial. */
export const createBibleDrawerState = (): BibleDrawerState => {
  const [isOpen, setIsOpen] = createSignal(false);
  const [status, setStatus] = createSignal<BibleDrawerStatus>({ _tag: 'idle' });
  const [strongsEnabled, setStrongs] = createSignal(false);
  const [isExpanded, setIsExpanded] = createSignal(false);
  const [activeStudyTab, setActiveStudyTabSig] = createSignal<BibleStudyTab>('notes');
  const [studyFocus, setStudyFocus] = createSignal<StudyPaneFocus>({ _tag: 'none' });
  const [view, setViewSig] = createSignal<BibleDrawerView>({ _tag: 'reader' });
  const [cursorVerse, setCursorVerse] = createSignal<number | null>(null);

  // Bump on each open() call so a slow IPC response can't overwrite a newer
  // one with stale data when the user clicks two refs in quick succession.
  let requestSeq = 0;

  const loadChapter = (
    query: string,
    book: number,
    chapter: number,
    parsed: ParsedBibleQuery,
  ): void => {
    const seq = ++requestSeq;
    const wantStrongs = strongsEnabled();
    setStatus({ _tag: 'loading', query });
    void runtime
      .runPromise(
        Effect.gen(function* () {
          const svc = yield* KjvBible;
          const plain = yield* svc.getChapter(book, chapter);
          if (!wantStrongs || Option.isNone(plain)) {
            return { plain, strongs: Option.none<KjvStrongsChapter>() };
          }
          // Strongs IPC is independent — if it fails we still render plain.
          const strongs = yield* svc
            .getChapterStrongs(book, chapter)
            .pipe(Effect.orElseSucceed(() => Option.none<KjvStrongsChapter>()));
          return { plain, strongs };
        }),
      )
      .then(({ plain, strongs }) => {
        if (seq !== requestSeq) return;
        if (Option.isNone(plain)) {
          setStatus({
            _tag: 'not-found',
            query,
            reason: `KJV has no chapter ${String(chapter)} of book ${String(book)}.`,
          });
          return;
        }
        const highlight = highlightFor(parsed);
        setStatus({
          _tag: 'ready',
          query,
          parsed,
          chapter: plain.value,
          strongs,
          highlight,
        });
        // Cursor lands on the first highlighted verse if the parsed query
        // pinned one, otherwise the top of the chapter. Lets j/k start from a
        // sensible anchor instead of nothing.
        setCursorVerse(highlight.length > 0 ? (highlight[0] ?? null) : 1);
      })
      .catch((err: unknown) => {
        if (seq !== requestSeq) return;
        setStatus({
          _tag: 'error',
          query,
          message: err instanceof Error ? err.message : String(err),
        });
      });
  };

  const open = (query: string): void => {
    setIsOpen(true);
    const parsed = parseBibleQuery(query);
    const target = targetChapter(parsed);
    if (Option.isNone(target)) {
      setStatus({
        _tag: 'not-found',
        query,
        reason: `Couldn't parse "${query}" as a Bible reference.`,
      });
      return;
    }
    loadChapter(query, target.value.book, target.value.chapter, parsed);
  };

  const navigate = (book: number, chapter: number): void => {
    // Internal navigation (prev/next chapter buttons or TOC selection). We
    // synthesize a chapter-only parsed query so the highlight set is empty
    // and the title displays as "<Book> <chapter>". Always returns the body
    // to the reader view — TOC drilldowns end here.
    const parsed: ParsedBibleQuery = { _tag: 'chapter', book, chapter };
    setViewSig({ _tag: 'reader' });
    loadChapter(`${String(book)}:${String(chapter)}`, book, chapter, parsed);
  };

  const close = (): void => {
    setIsOpen(false);
    // Leave status alone so reopening the drawer (e.g. via the same ref) feels
    // instant — no flash of "loading" before the cached chapter reappears.
  };

  const setStrongsEnabled = (enabled: boolean): void => {
    if (strongsEnabled() === enabled) return;
    setStrongs(enabled);
    // Reload the current chapter so the strongs payload (or its absence)
    // shows up immediately, without waiting for prev/next navigation.
    const s = status();
    if (s._tag === 'ready') {
      loadChapter(s.query, s.chapter.book, s.chapter.chapter, s.parsed);
    }
  };

  const setExpanded = (expanded: boolean): void => {
    if (isExpanded() === expanded) return;
    setIsExpanded(expanded);
    // Manual collapse clears any lingering focus so a later expand starts
    // from a clean slate. The active tab is preserved so the user lands
    // back where they last were.
    if (!expanded) setStudyFocus({ _tag: 'none' });
  };

  const setActiveStudyTab = (tab: BibleStudyTab): void => {
    setActiveStudyTabSig(tab);
  };

  const openStudyTab = (tab: BibleStudyTab, focus: StudyPaneFocus = { _tag: 'none' }): void => {
    setActiveStudyTabSig(tab);
    setStudyFocus(focus);
    setIsExpanded(true);
  };

  const openAt = (
    book: number,
    chapter: number,
    tab: BibleStudyTab,
    focus: StudyPaneFocus,
  ): void => {
    setIsOpen(true);
    // Skip the reload if we're already on this chapter — avoids a "loading"
    // flash when the user clicks a Strong's superscript on a verse in the
    // chapter the drawer already has cached.
    const s = status();
    const alreadyOnChapter =
      s._tag === 'ready' && s.chapter.book === book && s.chapter.chapter === chapter;
    if (!alreadyOnChapter) {
      navigate(book, chapter);
    }
    openStudyTab(tab, focus);
  };

  const openBooksToc = (): void => {
    setViewSig({ _tag: 'books-toc' });
  };

  const openBookToc = (book: number): void => {
    setViewSig({ _tag: 'book-toc', book });
  };

  const backToReader = (): void => {
    setViewSig({ _tag: 'reader' });
  };

  const moveCursor = (delta: 1 | -1): void => {
    const s = status();
    if (s._tag !== 'ready') return;
    const verses = s.chapter.verses;
    if (verses.length === 0) return;
    const first = verses[0]?.verse ?? 1;
    const last = verses[verses.length - 1]?.verse ?? first;
    const cur = cursorVerse() ?? first;
    const next = Math.max(first, Math.min(last, cur + delta));
    if (next !== cur) setCursorVerse(next);
  };

  return {
    isOpen,
    status,
    strongsEnabled,
    isExpanded,
    activeStudyTab,
    studyFocus,
    view,
    cursorVerse,
    open,
    navigate,
    close,
    setStrongsEnabled,
    setExpanded,
    setActiveStudyTab,
    openStudyTab,
    openAt,
    openBooksToc,
    openBookToc,
    backToReader,
    moveCursor,
  };
};
