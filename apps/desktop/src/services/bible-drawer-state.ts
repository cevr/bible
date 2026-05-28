import { parseBibleQuery } from '@bible/core/bible-reader';
import { type Accessor, createSignal } from 'solid-js';

// Right-side verse-study drawer. Verse-pinned, four tabs (Notes / Cross-refs /
// Words / EGW). Mounted in both Bible and EGW modes; the active verse comes
// from different sources depending on mode:
//   - Bible mode: subscribes to BibleReaderState (cursor moves → drawer follows)
//   - EGW mode: explicitly pinned by ScriptureRef clicks
// The drawer itself doesn't know which mode it's in — it just exposes
// `open(book, chapter, verse)` and lets app.tsx wire each mode's triggers.

/** The four study tabs. Words = Strong's concordance + lexicon (search by
 *  code or English word). The old standalone Strong's tab is folded into
 *  Words; the EGW commentary lives in its own tab here instead of a
 *  separate drawer. */
export type BibleStudyTab = 'notes' | 'xrefs' | 'words' | 'egw';

/** Optional focus hint carried when the drawer is opened from a specific
 *  inline anchor. Lets tabs auto-populate (e.g. Strong's super → Words tab
 *  with the code prefilled). `none` is the default — tabs render in their
 *  generic "show whatever the active verse needs" mode. */
export type StudyPaneFocus =
  | { readonly _tag: 'none' }
  | { readonly _tag: 'note'; readonly verse: number; readonly noteIndex: number }
  | { readonly _tag: 'strongs'; readonly verse: number; readonly code: string };

export interface DrawerTarget {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
}

/** Lifecycle of the drawer: `never` (no first open yet — no target to show),
 *  `closed` (was open before, has a last-known target we could re-open on),
 *  `open` (visible, pinned to a target). Encoded as a tagged variant so
 *  `{open: true, target: null}` is unrepresentable. */
export type BibleDrawerLifecycle =
  | { readonly _tag: 'never' }
  | { readonly _tag: 'closed'; readonly lastTarget: DrawerTarget }
  | { readonly _tag: 'open'; readonly target: DrawerTarget };

export interface BibleDrawerState {
  readonly lifecycle: Accessor<BibleDrawerLifecycle>;
  readonly isOpen: Accessor<boolean>;
  /** The verse the drawer is currently pinned to (only when open). `null`
   *  otherwise — consumers should usually read `lifecycle()` directly when
   *  they need to distinguish "never opened" from "closed with history". */
  readonly target: Accessor<DrawerTarget | null>;
  readonly activeStudyTab: Accessor<BibleStudyTab>;
  readonly studyFocus: Accessor<StudyPaneFocus>;
  readonly close: () => void;
  /** User switched study tabs. Fans out to `persistTab` if configured. */
  readonly switchStudyTab: (tab: BibleStudyTab) => void;
  /** Replay a persisted tab on startup without calling the persist callback.
   *  Distinct from `switchStudyTab` so the seed path doesn't write the
   *  same value straight back to disk. */
  readonly seedActiveStudyTab: (tab: BibleStudyTab) => void;
  /** Open the drawer pinned to a specific verse. Optional `tab` overrides
   *  the user's last-used tab (used by Strong's-super / margin-note / `e`
   *  clicks that should land on a specific tab). Optional `focus` carries
   *  extra context the tab body can react to (e.g. a Strong's code). */
  readonly open: (
    book: number,
    chapter: number,
    verse: number,
    tab?: BibleStudyTab,
    focus?: StudyPaneFocus,
  ) => void;
  /** The Bible cursor moved to a new verse. Drives the drawer's pinned
   *  target so the header + tab bodies follow the canvas cursor. No-op if
   *  the drawer is closed (don't re-render invisible content). */
  readonly cursorMoved: (target: DrawerTarget) => void;
  /** Open from a parsed ScriptureRef string ("Matt 5:3", "Gen 1"). Returns
   *  whether the parse resolved to a target the drawer can open on. Chapter-
   *  only refs default to verse 1. Full-book / search / chapter-range refs
   *  fall back to the first verse of the first chapter. */
  readonly openFromQuery: (query: string) => boolean;
}

const targetFromQuery = (query: string): DrawerTarget | null => {
  const parsed = parseBibleQuery(query);
  switch (parsed._tag) {
    case 'single':
      return {
        book: parsed.ref.book,
        chapter: parsed.ref.chapter,
        verse: parsed.ref.verse ?? 1,
      };
    case 'chapter':
      return { book: parsed.book, chapter: parsed.chapter, verse: 1 };
    case 'verseRange':
      return { book: parsed.book, chapter: parsed.chapter, verse: parsed.startVerse };
    case 'chapterRange':
      return { book: parsed.book, chapter: parsed.startChapter, verse: 1 };
    case 'fullBook':
      return { book: parsed.book, chapter: 1, verse: 1 };
    case 'search':
      return null;
  }
};

export interface BibleDrawerStateOptions {
  readonly initialTab?: BibleStudyTab;
  /**
   * Called whenever the active study tab is set via user interaction
   * (`switchStudyTab` or `open(... , tab)`). Not called by the seed
   * setter `seedActiveStudyTab`, which exists for replaying persisted state
   * without re-persisting it. Optional so tests can use the bare state
   * machine without an I/O layer.
   */
  readonly persistTab?: (tab: BibleStudyTab) => void;
}

/** Module-singleton drawer state. The drawer is global UI — one at a time —
 *  so we keep its state outside any component to avoid prop-drilling.
 *  Persistence is wired in via `persistTab` so the state machine stays the
 *  single source of truth for the active tab — no parallel mirror in
 *  app.tsx. */
export const createBibleDrawerState = (options: BibleDrawerStateOptions = {}): BibleDrawerState => {
  const { initialTab = 'notes', persistTab } = options;
  const [lifecycle, setLifecycle] = createSignal<BibleDrawerLifecycle>({ _tag: 'never' });
  const [activeStudyTab, setActiveStudyTabSig] = createSignal<BibleStudyTab>(initialTab);
  const [studyFocus, setStudyFocus] = createSignal<StudyPaneFocus>({ _tag: 'none' });

  const isOpen = (): boolean => lifecycle()._tag === 'open';
  const target = (): DrawerTarget | null => {
    const l = lifecycle();
    return l._tag === 'open' ? l.target : null;
  };

  const switchStudyTab = (tab: BibleStudyTab): void => {
    setActiveStudyTabSig(tab);
    persistTab?.(tab);
  };

  /** Replay persisted tab on startup without re-writing it back to disk. */
  const seedActiveStudyTab = (tab: BibleStudyTab): void => {
    setActiveStudyTabSig(tab);
  };

  const open = (
    book: number,
    chapter: number,
    verse: number,
    tab?: BibleStudyTab,
    focus?: StudyPaneFocus,
  ): void => {
    setLifecycle({ _tag: 'open', target: { book, chapter, verse } });
    if (tab !== undefined) {
      setActiveStudyTabSig(tab);
      persistTab?.(tab);
    }
    setStudyFocus(focus ?? { _tag: 'none' });
  };

  const cursorMoved = (next: DrawerTarget): void => {
    const l = lifecycle();
    if (l._tag !== 'open') return;
    const cur = l.target;
    if (cur.book === next.book && cur.chapter === next.chapter && cur.verse === next.verse) {
      return;
    }
    setLifecycle({ _tag: 'open', target: next });
    // Cursor-driven retargeting clears the focus hint — it was tied to the
    // verse the user explicitly clicked, not wherever the cursor wanders to.
    setStudyFocus({ _tag: 'none' });
  };

  const close = (): void => {
    setLifecycle((l) => (l._tag === 'open' ? { _tag: 'closed', lastTarget: l.target } : l));
  };

  const openFromQuery = (query: string): boolean => {
    const t = targetFromQuery(query);
    if (t === null) return false;
    open(t.book, t.chapter, t.verse);
    return true;
  };

  return {
    lifecycle,
    isOpen,
    target,
    activeStudyTab,
    studyFocus,
    close,
    switchStudyTab,
    seedActiveStudyTab,
    open,
    cursorMoved,
    openFromQuery,
  };
};
