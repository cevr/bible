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

export interface BibleDrawerState {
  readonly isOpen: Accessor<boolean>;
  /** The verse the drawer is pinned to. `null` only before the first open. */
  readonly target: Accessor<DrawerTarget | null>;
  readonly activeStudyTab: Accessor<BibleStudyTab>;
  readonly studyFocus: Accessor<StudyPaneFocus>;
  readonly close: () => void;
  readonly setActiveStudyTab: (tab: BibleStudyTab) => void;
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
  /** Update the pinned verse without changing open/closed or the tab.
   *  Used by Bible mode's `BibleReaderState` subscription so the drawer's
   *  header + tab bodies follow the canvas cursor. No-op if the drawer is
   *  closed (don't bother re-rendering invisible content). */
  readonly setTarget: (target: DrawerTarget) => void;
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

/** Module-singleton drawer state. The drawer is global UI — one at a time —
 *  so we keep its state outside any component to avoid prop-drilling.
 *  `initialTab` is loaded from ReaderSettings by app.tsx; updates fan out
 *  through the wrapper layer there. */
export const createBibleDrawerState = (initialTab: BibleStudyTab = 'notes'): BibleDrawerState => {
  const [isOpen, setIsOpen] = createSignal(false);
  const [target, setTargetSig] = createSignal<DrawerTarget | null>(null);
  const [activeStudyTab, setActiveStudyTabSig] = createSignal<BibleStudyTab>(initialTab);
  const [studyFocus, setStudyFocus] = createSignal<StudyPaneFocus>({ _tag: 'none' });

  const setActiveStudyTab = (tab: BibleStudyTab): void => {
    setActiveStudyTabSig(tab);
  };

  const open = (
    book: number,
    chapter: number,
    verse: number,
    tab?: BibleStudyTab,
    focus?: StudyPaneFocus,
  ): void => {
    setTargetSig({ book, chapter, verse });
    if (tab !== undefined) setActiveStudyTabSig(tab);
    setStudyFocus(focus ?? { _tag: 'none' });
    setIsOpen(true);
  };

  const setTarget = (next: DrawerTarget): void => {
    if (!isOpen()) return;
    const cur = target();
    if (cur && cur.book === next.book && cur.chapter === next.chapter && cur.verse === next.verse) {
      return;
    }
    setTargetSig(next);
    // Cursor-driven retargeting clears the focus hint — it was tied to the
    // verse the user explicitly clicked, not wherever the cursor wanders to.
    setStudyFocus({ _tag: 'none' });
  };

  const close = (): void => {
    setIsOpen(false);
  };

  const openFromQuery = (query: string): boolean => {
    const t = targetFromQuery(query);
    if (t === null) return false;
    open(t.book, t.chapter, t.verse);
    return true;
  };

  return {
    isOpen,
    target,
    activeStudyTab,
    studyFocus,
    close,
    setActiveStudyTab,
    open,
    setTarget,
    openFromQuery,
  };
};
