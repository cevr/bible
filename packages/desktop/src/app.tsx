import { Effect, Fiber, Option, Stream } from 'effect';
import { type Component, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { BibleChapterCanvas } from './components/bible-chapter-canvas.js';
import { BibleCommentaryDrawer } from './components/bible-commentary-drawer.js';
import { BibleDrawer } from './components/bible-drawer.js';
import { BibleTocSidebar } from './components/bible-toc-sidebar.js';
import { FolderBrowser } from './components/folder-browser.js';
import { ReaderPane } from './components/reader-pane.js';
import { SearchPanel } from './components/search-panel.js';
import { TocSidebar } from './components/toc-sidebar.js';
import { BibleReaderState, type BibleReaderSelection } from './services/bible-reader-state.js';
import { createBibleDrawerState } from './services/bible-drawer-state.js';
import { defaultEase, Motion, Presence, useDrag } from './motion/index.js';
import { animateProperty } from './motion/internals/driver.js';
import { runtime } from './runtime.js';
import { LastPositionStorage } from './services/last-position-storage.js';
import { openBookAtFirstChapter } from './services/open-book.js';
import { Prefetcher } from './services/prefetcher.js';
import {
  BIBLE_DRAWER_WIDE_WIDTH_BOUNDS,
  BIBLE_DRAWER_WIDTH_BOUNDS,
  type FontFamily,
  ReaderSettings,
  type ReaderFontScale,
  type ReaderMode,
  type Theme,
  type UiScale,
} from './services/reader-settings.js';
import { ReaderState, type ReaderSelection } from './services/reader-state.js';

const FONT_FAMILY_VAR: Record<FontFamily, string> = {
  serif: 'var(--font-serif)',
  sans: 'var(--font-sans)',
  mono: 'var(--font-mono)',
};

const THEMES: ReadonlyArray<Theme> = ['light', 'sepia', 'dark'];
const FONT_FAMILIES: ReadonlyArray<FontFamily> = ['serif', 'sans', 'mono'];
const UI_SCALES: ReadonlyArray<UiScale> = ['sm', 'md', 'lg', 'xl'];
const UI_SCALE_VALUE: Record<UiScale, number> = {
  sm: 0.875,
  md: 1,
  lg: 1.125,
  xl: 1.25,
};

const READER_FONT_SCALES: ReadonlyArray<ReaderFontScale> = ['sm', 'base', 'lg', 'xl', '2xl', '3xl'];
const isReaderFontScale = (v: string): v is ReaderFontScale =>
  (READER_FONT_SCALES as ReadonlyArray<string>).includes(v);
const isUiScale = (v: string): v is UiScale => (UI_SCALES as ReadonlyArray<string>).includes(v);
const READER_FONT_PX: Record<ReaderFontScale, number> = {
  sm: 15,
  base: 18,
  lg: 21,
  xl: 24,
  '2xl': 28,
  '3xl': 32,
};

const FONT_KEY_STEP: Record<ReaderFontScale, { up: ReaderFontScale; down: ReaderFontScale }> = {
  sm: { up: 'base', down: 'sm' },
  base: { up: 'lg', down: 'sm' },
  lg: { up: 'xl', down: 'base' },
  xl: { up: '2xl', down: 'lg' },
  '2xl': { up: '3xl', down: 'xl' },
  '3xl': { up: '3xl', down: '2xl' },
};

// Pretty label for the line-height slider. Bare ratio under the unitless ceiling,
// px above it — mirrors the CSS-var emit unit so the displayed value matches what's
// actually applied.
const UNITLESS_LINE_HEIGHT_MAX = 2;
const formatLineHeight = (n: number): string =>
  n <= UNITLESS_LINE_HEIGHT_MAX ? n.toFixed(2) : `${String(Math.round(n))}px`;
const lineHeightCss = (n: number): string =>
  n <= UNITLESS_LINE_HEIGHT_MAX ? String(n) : `${String(Math.round(n))}px`;

const DRAG_CLOSE_THRESHOLD_PX = 120;

// Three-layer drawer stack for the open-book flow:
//   - 'closed'      reader fills canvas
//   - 'toc'         TOC slides in over reader
//   - 'tocPlusLib'  Library explorer slides in on top of TOC
// State only applies when a book is open. Closing the book resets to 'closed'.
type DrawerState = 'closed' | 'toc' | 'tocPlusLib';

export const App: Component = () => {
  // UI mirror of ReaderSettings so reads are synchronous for templating.
  // ReaderSettings remains the source of truth; setters fan out to both.
  const [theme, setThemeSig] = createSignal<Theme>('light');
  const [fontFamily, setFontFamilySig] = createSignal<FontFamily>('serif');
  const [fontSize, setFontSizeSig] = createSignal<ReaderFontScale>('base');
  const [lineHeight, setLineHeightSig] = createSignal(1.55);
  const [letterSpacing, setLetterSpacingSig] = createSignal(0);
  const [lineWidth, setLineWidthSig] = createSignal(68);
  const [uiScale, setUiScaleSig] = createSignal<UiScale>('md');
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  // Top-level reader mode. Persisted via ReaderSettings so a relaunch lands
  // the user in whichever mode they left in. F3.1 wires the signal + header
  // toggle; later sub-commits use it to swap which canvas/drawer render.
  const [readerMode, setReaderModeSig] = createSignal<ReaderMode>('egw');

  // Bible drawer — one instance for the whole app. Scripture refs anywhere
  // in the reader open it via the onScriptureClick callback threaded into
  // ReaderPane → BookFeed → ParagraphView.
  //
  // We wrap setStrongsEnabled so every toggle through the drawer UI fans out
  // into ReaderSettings persistence too. The base state object stays pure
  // (no I/O), which keeps it test-friendly.
  const bibleDrawerBase = createBibleDrawerState();
  const bibleDrawer = {
    ...bibleDrawerBase,
    setStrongsEnabled: (enabled: boolean) => {
      bibleDrawerBase.setStrongsEnabled(enabled);
      updateSettings(
        Effect.gen(function* () {
          const s = yield* ReaderSettings;
          yield* s.setBibleDrawerStrongs(enabled);
        }),
      );
    },
  };
  const [bibleDrawerWidth, setBibleDrawerWidthSig] = createSignal<number>(
    BIBLE_DRAWER_WIDTH_BOUNDS.default,
  );
  const [bibleDrawerWideWidth, setBibleDrawerWideWidthSig] = createSignal<number>(
    BIBLE_DRAWER_WIDE_WIDTH_BOUNDS.default,
  );

  // Reader selection mirror — drives whether we render landing (FolderBrowser)
  // or the reader, and feeds props.selection into ReaderPane.
  const [selection, setSelection] = createSignal<Option.Option<ReaderSelection>>(Option.none());

  // Bible-mode selection mirror. Driven by BibleReaderState (same pattern as
  // the EGW reader's `selection`). Used so the Bible TOC drawer can highlight
  // the active book/chapter, and so the shell can decide whether the right
  // commentary drawer should mount.
  const [bibleSelection, setBibleSelection] = createSignal<Option.Option<BibleReaderSelection>>(
    Option.none(),
  );
  const bibleTocSelection = createMemo(() => {
    const sel = bibleSelection();
    if (Option.isNone(sel))
      return Option.none<{ readonly book: number; readonly chapter: number }>();
    return Option.some({ book: sel.value.book, chapter: sel.value.chapter });
  });

  // Restore anchor — the paragraph paraId we persisted last time the user
  // was reading this chapter. ReaderPane consumes it once on mount via
  // restoreParagraphId. We clear it when selection changes (a TOC click /
  // search-jump implies the user wants to land somewhere specific, not
  // their old position). Otherwise it's the seed read from LastPositionStorage
  // on first launch.
  const [restoreParagraphId, setRestoreParagraphId] = createSignal<Option.Option<string>>(
    Option.none(),
  );

  // Latest scroll-spy anchor reported by BookFeed. Used so selection-change
  // writes can include the most-recent paragraph anchor (e.g. when chapter
  // closes/reopens), avoiding a write that drops the paragraphId we just had.
  let latestAnchorParaId: string | null = null;

  // True between rehydration seeding the restore anchor and the matching
  // ReaderState.changes emit arriving. Lets the change-handler skip its
  // "clear restore on new chapter" branch for that one rehydration emit.
  let pendingRestoreEmit = false;

  // False until LastPositionStorage.read resolves. Renderer is mounted, but
  // selection() is still None — without this gate we'd flash the FolderBrowser
  // landing canvas for a few hundred ms on every refresh while the IPC
  // round-trip + openChapter pipeline catches up.
  const [rehydrated, setRehydrated] = createSignal(false);

  // Drawer state. Only meaningful when a book is open.
  const [drawer, setDrawer] = createSignal<DrawerState>('closed');

  // Reset drawers whenever the book is closed (e.g. via Esc, or future close
  // affordance). Keeps the layout coherent: drawers only exist over a reader.
  const closeDrawers = () => setDrawer('closed');

  const [searchInputRef, setSearchInputRef] = createSignal<HTMLInputElement | undefined>(undefined);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [searchOpen, setSearchOpen] = createSignal(false);
  const closeSearch = () => {
    setSearchOpen(false);
  };
  const openSearch = () => {
    setSearchOpen(true);
  };

  onMount(() => {
    void runtime
      .runPromise(
        Effect.gen(function* () {
          const s = yield* ReaderSettings;
          return yield* s.get;
        }),
      )
      .then((state) => {
        setThemeSig(state.theme);
        setFontFamilySig(state.fontFamily);
        setFontSizeSig(state.fontSize);
        setLineHeightSig(state.lineHeight);
        setLetterSpacingSig(state.letterSpacing);
        setLineWidthSig(state.lineWidth);
        setUiScaleSig(state.uiScale ?? 'md');
        if (state.bibleDrawerWidth !== undefined) {
          setBibleDrawerWidthSig(state.bibleDrawerWidth);
        }
        if (state.bibleDrawerWideWidth !== undefined) {
          setBibleDrawerWideWidthSig(state.bibleDrawerWideWidth);
        }
        if (state.bibleDrawerStrongs === true) {
          // Seed via the base (non-persisting) setter — re-writing the same
          // flag back to disk on every launch would be silly.
          bibleDrawerBase.setStrongsEnabled(true);
        }
        if (state.readerMode !== undefined) {
          setReaderModeSig(state.readerMode);
        }
      });

    // Rehydrate last position on mount, then mirror + persist every change.
    // The rehydration replays into ReaderState (openBook/openChapter), which
    // fires `changes` and persists the same value back — harmless one-row
    // upsert. Persisting from the same fiber that mirrors keeps the order
    // deterministic: the signal updates before the disk write returns.
    void runtime
      .runPromise(
        Effect.gen(function* () {
          const storage = yield* LastPositionStorage;
          return yield* storage.read;
        }),
      )
      .then((restored) => {
        if (Option.isNone(restored)) {
          setRehydrated(true);
          return;
        }
        const pos = restored.value;
        // Seed the restore anchor BEFORE opening the chapter so BookFeed sees
        // it on first render and can scroll-to-restore without flicker.
        if (Option.isSome(pos.paragraphId)) {
          setRestoreParagraphId(pos.paragraphId);
          latestAnchorParaId = pos.paragraphId.value;
          pendingRestoreEmit = true;
        }
        void runtime
          .runPromise(
            Effect.gen(function* () {
              if (Option.isSome(pos.paraId)) {
                const state = yield* ReaderState;
                yield* state.openChapter(pos.bookId, pos.paraId.value);
              } else {
                // Persisted bookId with no chapter (e.g. user closed before
                // picking one) — auto-resolve to the first chapter rather
                // than restoring into the "Pick a chapter" empty state.
                yield* openBookAtFirstChapter(pos.bookId);
              }
            }),
          )
          .catch((err) => {
            console.error('[rehydrate] openChapter failed', err);
          })
          .finally(() => {
            setRehydrated(true);
          });
      })
      .catch((err) => {
        console.error('[rehydrate] storage.read failed', err);
        setRehydrated(true);
      });

    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const state = yield* ReaderState;
        const storage = yield* LastPositionStorage;
        yield* state.changes.pipe(
          Stream.runForEach((next) =>
            Effect.gen(function* () {
              const prev = selection();
              setSelection(next);
              if (Option.isNone(next)) {
                latestAnchorParaId = null;
                setRestoreParagraphId(Option.none());
                yield* storage.clear;
              } else {
                // Clear the restore anchor when the user actively navigates
                // (TOC click / search-jump / book switch). Compared against
                // the prior selection so a same-chapter re-emit (e.g. from
                // clearHighlight) leaves the anchor in place.
                const prevSel = Option.getOrUndefined(prev);
                const sameChapter =
                  prevSel !== undefined &&
                  prevSel.bookId === next.value.bookId &&
                  Option.isSome(prevSel.chapterParaId) &&
                  Option.isSome(next.value.chapterParaId) &&
                  prevSel.chapterParaId.value === next.value.chapterParaId.value;
                if (!sameChapter && !pendingRestoreEmit) {
                  latestAnchorParaId = null;
                  setRestoreParagraphId(Option.none());
                }
                pendingRestoreEmit = false;
                yield* storage.write({
                  bookId: next.value.bookId,
                  paraId: next.value.chapterParaId,
                  paragraphId: Option.fromNullishOr(latestAnchorParaId),
                });
              }
            }),
          ),
        );
      }),
    );

    // Bible-mode selection mirror. No persistence yet — Bible last-position
    // restore is a follow-up. For now we just keep the local signal in sync so
    // the TOC can highlight the active chapter and the shell can decide what
    // to render.
    const bibleFiber = runtime.runFork(
      Effect.gen(function* () {
        const state = yield* BibleReaderState;
        yield* state.changes.pipe(
          Stream.runForEach((next) => Effect.sync(() => setBibleSelection(next))),
        );
      }),
    );

    // Background chapter warmer.
    const prefetchFiber = runtime.runFork(
      Effect.gen(function* () {
        const prefetcher = yield* Prefetcher;
        yield* prefetcher.start;
      }),
    );

    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(fiber));
      void runtime.runPromise(Fiber.interrupt(bibleFiber));
      void runtime.runPromise(Fiber.interrupt(prefetchFiber));
    });
  });

  const updateSettings = (effect: Effect.Effect<void, never, ReaderSettings>) => {
    void runtime.runPromise(effect);
  };

  const setTheme = (t: Theme) => {
    setThemeSig(t);
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.setTheme(t);
      }),
    );
  };

  const setFontFamily = (f: FontFamily) => {
    setFontFamilySig(f);
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.setFontFamily(f);
      }),
    );
  };

  const setFontSize = (scale: ReaderFontScale) => {
    setFontSizeSig(scale);
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.setFontSize(scale);
      }),
    );
  };

  const setReaderMode = (mode: ReaderMode) => {
    setReaderModeSig(mode);
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.setReaderMode(mode);
      }),
    );
  };

  const toggleReaderMode = () => {
    setReaderMode(readerMode() === 'egw' ? 'bible' : 'egw');
  };

  const setUiScale = (scale: UiScale) => {
    setUiScaleSig(scale);
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.setUiScale(scale);
      }),
    );
  };

  const setLineHeight = (n: number) => {
    setLineHeightSig(n);
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.setLineHeight(n);
      }),
    );
  };

  const setLetterSpacing = (n: number) => {
    setLetterSpacingSig(n);
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.setLetterSpacing(n);
      }),
    );
  };

  const setLineWidth = (n: number) => {
    setLineWidthSig(n);
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.setLineWidth(n);
      }),
    );
  };

  // Bible drawer width — UI moves synchronously, persist is debounced by the
  // settings layer so dragging the handle doesn't thrash disk.
  const setBibleDrawerWidth = (px: number) => {
    setBibleDrawerWidthSig(px);
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.setBibleDrawerWidth(px);
      }),
    );
  };
  const setBibleDrawerWideWidth = (px: number) => {
    setBibleDrawerWideWidthSig(px);
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.setBibleDrawerWideWidth(px);
      }),
    );
  };

  const cycleTheme = () => {
    const idx = THEMES.indexOf(theme());
    setTheme(THEMES[(idx + 1) % THEMES.length] ?? 'light');
  };

  const closeSheet = () => {
    setSettingsOpen(false);
  };

  // Library button cycles drawer state. In EGW mode the button is hidden
  // when no book is open (the landing view IS the folder browser). In Bible
  // mode the TOC is always reachable, and there's no Library pane to expand
  // — we just toggle between 'closed' and 'toc'.
  const onLibraryClick = () => {
    if (!libraryAvailable()) return;
    if (isBibleMode()) {
      setDrawer((curr) => (curr === 'closed' ? 'toc' : 'closed'));
      return;
    }
    setDrawer((curr) => {
      if (curr === 'closed') return 'toc';
      if (curr === 'toc') return 'tocPlusLib';
      return 'closed';
    });
  };

  const focusSearch = () => {
    const el = searchInputRef();
    el?.focus();
    el?.select();
    openSearch();
  };

  const onKey = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'k') {
      e.preventDefault();
      focusSearch();
      return;
    }
    if (mod && e.key === 'Escape') {
      e.preventDefault();
      closeDrawers();
      return;
    }
    if (!mod) {
      // Esc closes the search panel first (highest-priority overlay), then
      // any open drawer. Letting Esc cascade like this avoids users needing
      // two presses when both are open.
      if (e.key === 'Escape') {
        if (searchOpen()) {
          e.preventDefault();
          closeSearch();
          searchInputRef()?.blur();
          return;
        }
        if (drawer() !== 'closed') {
          e.preventDefault();
          closeDrawers();
        }
      }
      return;
    }
    switch (e.key) {
      case 't':
        e.preventDefault();
        cycleTheme();
        return;
      case '=':
      case '+':
        e.preventDefault();
        setFontSize(FONT_KEY_STEP[fontSize()].up);
        return;
      case '-':
        e.preventDefault();
        setFontSize(FONT_KEY_STEP[fontSize()].down);
        return;
      case ',':
        e.preventDefault();
        setSettingsOpen((open) => !open);
        return;
      case 'm':
        e.preventDefault();
        toggleReaderMode();
        return;
      default:
        return;
    }
  };

  onMount(() => {
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  /* Drag-to-close for the settings sheet. We write `translate` directly on
     the sheet element during drag (bypassing Motion so each pointer move
     doesn't spawn a new WAAPI animation), then either close (Motion's exit
     plays) or animate back to rest via animateProperty on release. */
  let sheetEl: HTMLElement | undefined;
  const sheetDrag = useDrag({
    axis: 'y',
    constraints: { top: 0 },
    onDrag: ({ offset }) => {
      if (sheetEl !== undefined) sheetEl.style.translate = `0 ${String(offset.y)}px`;
    },
    onDragEnd: ({ offset }) => {
      if (offset.y > DRAG_CLOSE_THRESHOLD_PX) {
        closeSheet();
        return;
      }
      if (sheetEl !== undefined) {
        animateProperty(sheetEl, 'y', 0, { duration: 0.18, ease: defaultEase });
      }
    },
  });

  const hasBook = () => Option.isSome(selection());
  const currentBookId = () => {
    const sel = selection();
    return Option.isSome(sel) ? sel.value.bookId : null;
  };

  // Library availability differs by mode: EGW gates the button on having a
  // book open (the landing canvas IS the library), but Bible mode's landing
  // canvas is the empty chapter prompt — we want the TOC reachable always.
  const isBibleMode = () => readerMode() === 'bible';
  const libraryAvailable = () => isBibleMode() || hasBook();

  // Picking a book in the Library drawer (state 2) closes both drawers and
  // lets ReaderPane swap to the new book. ReaderState.openBook has already
  // fired from inside FolderBrowser.
  const onPickBookFromDrawer = (_bookId: number) => {
    closeDrawers();
  };

  // Picking from the landing canvas just lets the selection drive the swap —
  // there's nothing to dismiss.
  const onPickBookFromLanding = (_bookId: number) => {
    // ReaderState.openBook already fired in FolderBrowser; nothing extra.
  };

  // ReaderPane reports when it has scrolled-to and flashed the highlighted
  // paragraph (search-result jump). Clear the highlight on ReaderState so a
  // re-render of the same chapter doesn't re-scroll.
  const onHighlightApplied = () => {
    void runtime.runPromise(
      Effect.gen(function* () {
        const state = yield* ReaderState;
        yield* state.clearHighlight;
      }),
    );
  };

  // Scroll-spy anchor moved — persist the new (chapter, paragraph) pair so
  // a relaunch restores at the topmost visible paragraph rather than just
  // the chapter start.
  const onPositionChange = (chapterParaId: string, paragraphParaId: string) => {
    latestAnchorParaId = paragraphParaId;
    const sel = selection();
    if (Option.isNone(sel)) return;
    const bookId = sel.value.bookId;
    void runtime.runPromise(
      Effect.gen(function* () {
        const storage = yield* LastPositionStorage;
        yield* storage.write({
          bookId,
          paraId: Option.some(chapterParaId),
          paragraphId: Option.some(paragraphParaId),
        });
      }),
    );
  };

  // Reader CSS-var bridge — these have to be on a root the chapter inherits
  // from. `--reader-*` names are consumed via arbitrary Tailwind value escapes
  // in BookFeed (`text-[length:var(--reader-font-size,18px)]` etc.) so the
  // chapter typography stays driven by these inline custom properties.
  // Resolved font-family token (after FONT_FAMILY_VAR mapping). Threaded
  // into ReaderPane so BookFeed's metrics probe re-samples on font change —
  // pretext's height cache is keyed by font, and stale predictions overlap rows.
  const readerFontFamily = createMemo(() => FONT_FAMILY_VAR[fontFamily()]);

  const readerStyle = () => ({
    '--reader-font-family': readerFontFamily(),
    '--reader-font-size': `${String(READER_FONT_PX[fontSize()])}px`,
    '--reader-line-height': lineHeightCss(lineHeight()),
    '--reader-letter-spacing': `${String(letterSpacing())}em`,
    '--reader-width': `${String(lineWidth())}ch`,
    '--ui-scale': String(UI_SCALE_VALUE[uiScale()]),
  });

  return (
    <div
      class="h-screen grid grid-rows-[auto_1fr] bg-bg text-fg transition-[background-color,color] duration-150 ease-in-out"
      data-theme={theme()}
      data-has-book={hasBook() ? 'true' : 'false'}
      style={readerStyle()}
    >
      <header class="flex items-center gap-2.5 px-3 py-2 h-[calc(44px*var(--ui-scale))] border-b border-rule bg-[color-mix(in_srgb,var(--color-bg)_90%,transparent)] backdrop-blur-md [-webkit-app-region:drag] z-[5]">
        <div class="w-[70px] flex-[0_0_70px]" aria-hidden="true" />
        <div
          class="inline-flex items-center gap-0 rounded-md border border-rule overflow-hidden [-webkit-app-region:no-drag]"
          role="group"
          aria-label="Reader mode"
        >
          <button
            type="button"
            class="inline-flex items-center justify-center h-[calc(28px*var(--ui-scale))] px-3 bg-transparent text-muted text-ui-base font-medium cursor-pointer transition-[background,color,box-shadow] duration-[0.12s] ease-in-out hover:text-fg hover:bg-[color-mix(in_srgb,var(--color-fg)_6%,transparent)] hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] focus-visible:outline-none data-active:bg-accent data-active:text-[var(--color-bg)] data-active:font-semibold data-active:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-fg)_8%,transparent)]"
            data-active={readerMode() === 'egw' ? '' : undefined}
            onClick={() => setReaderMode('egw')}
            title="EGW books (⌘M)"
            aria-label="EGW mode"
            aria-pressed={readerMode() === 'egw'}
          >
            EGW
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center h-[calc(28px*var(--ui-scale))] px-3 bg-transparent text-muted text-ui-base font-medium cursor-pointer border-l border-rule transition-[background,color,box-shadow] duration-[0.12s] ease-in-out hover:text-fg hover:bg-[color-mix(in_srgb,var(--color-fg)_6%,transparent)] hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] focus-visible:outline-none data-active:bg-accent data-active:text-[var(--color-bg)] data-active:font-semibold data-active:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-fg)_8%,transparent)]"
            data-active={readerMode() === 'bible' ? '' : undefined}
            onClick={() => setReaderMode('bible')}
            title="Bible reader (⌘M)"
            aria-label="Bible mode"
            aria-pressed={readerMode() === 'bible'}
          >
            Bible
          </button>
        </div>
        <Show when={libraryAvailable()}>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 h-[calc(28px*var(--ui-scale))] px-3 rounded-md border border-rule bg-transparent text-fg text-ui-base cursor-pointer transition-[background,border-color,color] duration-[0.12s] ease-in-out [-webkit-app-region:no-drag] hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] hover:border-accent hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:border-accent focus-visible:outline-none data-active:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] data-active:border-accent"
            data-active={drawer() !== 'closed' ? '' : undefined}
            onClick={onLibraryClick}
            title={isBibleMode() ? 'Books & chapters' : 'Library'}
            aria-label="Library"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
            >
              <path d="M4 5h6v14H4z" />
              <path d="M14 5h6v14h-6z" />
            </svg>
            <span>Library</span>
          </button>
        </Show>
        <div class="flex-1 flex justify-center [-webkit-app-region:no-drag]">
          <input
            ref={setSearchInputRef}
            type="search"
            class="w-[min(420px,100%)] h-[calc(28px*var(--ui-scale))] px-3 rounded-md border border-rule bg-[color-mix(in_srgb,var(--color-bg)_70%,var(--color-fg)_4%)] text-fg text-ui-base outline-none transition-[border-color] duration-[0.12s] ease-in-out [-webkit-app-region:no-drag] focus:border-accent"
            placeholder="Search or refcode (⌘K)"
            spellcheck={false}
            autocomplete="off"
            value={searchQuery()}
            onInput={(e) => {
              setSearchQuery(e.currentTarget.value);
              openSearch();
            }}
            onFocus={openSearch}
          />
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 h-[calc(28px*var(--ui-scale))] w-[calc(28px*var(--ui-scale))] p-0 justify-center rounded-md border border-rule bg-transparent text-muted text-ui-base cursor-pointer transition-[background,border-color,color] duration-[0.12s] ease-in-out [-webkit-app-region:no-drag] hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] hover:border-accent hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:border-accent focus-visible:outline-none"
          onClick={() => setSettingsOpen(true)}
          title="Settings (⌘,)"
          aria-label="Settings"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 1 1 4.36 16.94l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.06 4.36l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      <Show when={searchOpen()}>
        {/* Click-catcher behind the panel — dismisses the results without
            blurring the input (so the user can keep typing to refine).
            Positioned *below* the header so the search input itself
            stays clickable. */}
        <div
          class="fixed top-[calc(44px*var(--ui-scale))] left-0 right-0 bottom-0 z-30"
          onMouseDown={(e) => {
            e.preventDefault();
            closeSearch();
          }}
          aria-hidden="true"
        />
        <SearchPanel query={searchQuery} anchorEl={searchInputRef} onClose={closeSearch} />
      </Show>

      <div class="relative min-h-0 overflow-hidden">
        <Show
          when={isBibleMode()}
          fallback={
            <Show
              when={hasBook()}
              fallback={
                <Show when={rehydrated()}>
                  <div class="absolute inset-0 overflow-auto">
                    <FolderBrowser onPickBook={onPickBookFromLanding} />
                  </div>
                </Show>
              }
            >
              <ReaderPane
                selection={selection()}
                onHighlightApplied={onHighlightApplied}
                restoreParagraphId={restoreParagraphId}
                onPositionChange={onPositionChange}
                fontFamily={readerFontFamily}
                onScriptureClick={(title) => {
                  bibleDrawer.open(title);
                }}
              />
            </Show>
          }
        >
          <BibleChapterCanvas />
        </Show>
      </div>

      {/* Single drawer with two panes. State 1 = just TOC pane visible;
          state 2 = drawer expands and Library pane fades in to the right.
          Mounting both panes regardless of state lets the width transition
          run as a single smooth motion. */}
      <Presence>
        <Show when={libraryAvailable() && drawer() !== 'closed'}>
          <Motion.div
            class="fixed top-[calc(44px*var(--ui-scale))] left-0 right-0 bottom-0 bg-[color-mix(in_srgb,#000_28%,transparent)] z-30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: defaultEase }}
            onClick={closeDrawers}
          />
        </Show>
      </Presence>

      {/* Bible-mode left drawer: just the books/chapters TOC. No Library pane
          expansion — the Bible already enumerates its own books. */}
      <Presence>
        <Show when={isBibleMode() && drawer() !== 'closed'}>
          <Motion.aside
            class="fixed top-[calc(44px*var(--ui-scale))] bottom-0 left-0 w-[320px] bg-bg border-r border-rule z-[35] flex flex-col shadow-[4px_0_24px_color-mix(in_srgb,#000_16%,transparent)]"
            aria-label="Bible books"
            initial={{ x: -360, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -360, opacity: 0 }}
            transition={{ duration: 0.22, ease: defaultEase }}
          >
            <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-rule flex-[0_0_auto]">
              <h2 class="m-0 text-ui-sm font-semibold tracking-[0.08em] uppercase text-muted">
                Bible
              </h2>
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto">
              <BibleTocSidebar currentSelection={bibleTocSelection} onPickChapter={closeDrawers} />
            </div>
          </Motion.aside>
        </Show>
      </Presence>

      {/* EGW-mode left drawer: existing TOC + Library two-pane drawer. */}
      <Presence>
        <Show
          when={!isBibleMode() && hasBook() && drawer() !== 'closed' && currentBookId() !== null}
        >
          <Motion.aside
            class="fixed top-[calc(44px*var(--ui-scale))] bottom-0 left-0 w-[320px] bg-bg border-r border-rule z-[35] flex flex-row shadow-[4px_0_24px_color-mix(in_srgb,#000_16%,transparent)] transition-[width] duration-[0.24s] [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] data-expanded:w-[720px]"
            data-expanded={drawer() === 'tocPlusLib' ? '' : undefined}
            aria-label="Library and contents"
            initial={{ x: -360, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -360, opacity: 0 }}
            transition={{ duration: 0.22, ease: defaultEase }}
          >
            <div class="flex flex-col min-w-0 h-full flex-[0_0_320px] border-r border-rule">
              <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-rule flex-[0_0_auto]">
                <h2 class="m-0 text-ui-sm font-semibold tracking-[0.08em] uppercase text-muted">
                  Contents
                </h2>
                <button
                  type="button"
                  class="bg-transparent border border-rule rounded-md px-2 py-1 text-ui-xs text-fg cursor-pointer transition-[background,border-color] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] hover:border-accent hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:border-accent focus-visible:outline-none"
                  onClick={() =>
                    setDrawer((curr) => (curr === 'tocPlusLib' ? 'toc' : 'tocPlusLib'))
                  }
                  title={drawer() === 'tocPlusLib' ? 'Hide library' : 'Open library'}
                >
                  {drawer() === 'tocPlusLib' ? 'Close library' : 'Library'}
                </button>
              </div>
              <div class="flex-1 min-h-0 overflow-y-auto">
                <Show when={currentBookId()} keyed>
                  {(bookId) => <TocSidebar bookId={bookId} />}
                </Show>
              </div>
            </div>

            <div
              class="flex flex-col min-w-0 h-full flex-auto opacity-0 pointer-events-none transition-opacity duration-[0.18s] ease-in-out delay-[0.04s] data-expanded:opacity-100 data-expanded:pointer-events-auto"
              data-expanded={drawer() === 'tocPlusLib' ? '' : undefined}
              aria-hidden={drawer() !== 'tocPlusLib'}
            >
              <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-rule flex-[0_0_auto]">
                <h2 class="m-0 text-ui-sm font-semibold tracking-[0.08em] uppercase text-muted">
                  Library
                </h2>
              </div>
              <div class="flex-1 min-h-0 overflow-y-auto">
                <FolderBrowser onPickBook={onPickBookFromDrawer} />
              </div>
            </div>
          </Motion.aside>
        </Show>
      </Presence>

      <Presence>
        <Show when={settingsOpen()}>
          <Motion.div
            class="fixed inset-0 bg-[color-mix(in_srgb,#000_25%,transparent)] z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: defaultEase }}
            onClick={closeSheet}
          />
        </Show>
      </Presence>

      <Presence>
        <Show when={settingsOpen()}>
          <Motion.div
            ref={(el) => {
              sheetEl = el;
            }}
            class="fixed left-0 right-0 bottom-0 z-[60] bg-bg border-t border-rule rounded-t-2xl shadow-[0_-12px_40px_color-mix(in_srgb,#000_18%,transparent)] max-w-[720px] mx-auto touch-none"
            initial={{ y: 480 }}
            animate={{ y: 0 }}
            exit={{ y: 480 }}
            transition={{ duration: 0.22, ease: defaultEase }}
          >
            <div
              class="flex justify-center pt-2.5 pb-1.5 cursor-grab touch-none active:cursor-grabbing"
              onPointerDown={sheetDrag.onPointerDown}
            >
              <div class="w-10 h-1 rounded-sm bg-rule" />
            </div>
            <div class="px-5 pt-2 pb-6 flex flex-col gap-3.5">
              <div class="grid grid-cols-[80px_1fr_auto] items-center gap-3.5 text-ui-base text-muted">
                <span class="font-medium">Theme</span>
                <div class="flex gap-1.5">
                  <For each={THEMES}>
                    {(t) => {
                      const swatchBg =
                        t === 'light'
                          ? 'bg-[#fafaf7]'
                          : t === 'sepia'
                            ? 'bg-[#f6ecd9]'
                            : 'bg-[#1a1a1c]';
                      return (
                        <button
                          type="button"
                          class={`w-[22px] h-[22px] rounded-full border-[1.5px] border-rule cursor-pointer p-0 ${swatchBg} data-active:border-accent`}
                          data-active={theme() === t ? '' : undefined}
                          onClick={() => setTheme(t)}
                          title={t}
                          aria-label={t}
                        />
                      );
                    }}
                  </For>
                </div>
                <span class="[font-variant-numeric:tabular-nums] text-ui-sm min-w-[56px] text-right">
                  {theme()}
                </span>
              </div>

              <div class="grid grid-cols-[80px_1fr_auto] items-center gap-3.5 text-ui-base text-muted">
                <span class="font-medium">Font</span>
                <div class="flex gap-1">
                  <For each={FONT_FAMILIES}>
                    {(f) => (
                      <button
                        type="button"
                        class="w-8 h-7 rounded-md border border-rule bg-bg text-fg cursor-pointer p-0 text-ui-base leading-none data-active:border-accent data-active:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]"
                        data-active={fontFamily() === f ? '' : undefined}
                        style={{ 'font-family': FONT_FAMILY_VAR[f] }}
                        onClick={() => setFontFamily(f)}
                        title={f}
                      >
                        Aa
                      </button>
                    )}
                  </For>
                </div>
                <span class="[font-variant-numeric:tabular-nums] text-ui-sm min-w-[56px] text-right">
                  {fontFamily()}
                </span>
              </div>

              <div class="grid grid-cols-[80px_1fr_auto] items-center gap-3.5 text-ui-base text-muted">
                <span class="font-medium">Size</span>
                <select
                  class="w-full h-[calc(28px*var(--ui-scale))] px-2 rounded-md border border-rule bg-bg text-fg text-ui-base font-[inherit] cursor-pointer outline-none transition-[border-color] duration-[0.12s] ease-in-out focus:border-accent"
                  value={fontSize()}
                  onInput={(e) => {
                    const v = e.currentTarget.value;
                    if (isReaderFontScale(v)) setFontSize(v);
                  }}
                >
                  <For each={READER_FONT_SCALES}>
                    {(scale) => (
                      <option value={scale}>
                        {scale} · {String(READER_FONT_PX[scale])}px
                      </option>
                    )}
                  </For>
                </select>
                <span class="[font-variant-numeric:tabular-nums] text-ui-sm min-w-[56px] text-right">
                  {READER_FONT_PX[fontSize()]}px
                </span>
              </div>

              <div class="grid grid-cols-[80px_1fr_auto] items-center gap-3.5 text-ui-base text-muted">
                <span class="font-medium">UI</span>
                <select
                  class="w-full h-[calc(28px*var(--ui-scale))] px-2 rounded-md border border-rule bg-bg text-fg text-ui-base font-[inherit] cursor-pointer outline-none transition-[border-color] duration-[0.12s] ease-in-out focus:border-accent"
                  value={uiScale()}
                  onInput={(e) => {
                    const v = e.currentTarget.value;
                    if (isUiScale(v)) setUiScale(v);
                  }}
                >
                  <For each={UI_SCALES}>{(scale) => <option value={scale}>{scale}</option>}</For>
                </select>
                <span class="[font-variant-numeric:tabular-nums] text-ui-sm min-w-[56px] text-right">
                  {Math.round(UI_SCALE_VALUE[uiScale()] * 100)}%
                </span>
              </div>

              <div class="grid grid-cols-[80px_1fr_auto] items-center gap-3.5 text-ui-base text-muted">
                <span class="font-medium">Width</span>
                <input
                  type="range"
                  class="w-full [accent-color:var(--color-accent)]"
                  min="40"
                  max="120"
                  step="1"
                  value={lineWidth()}
                  onInput={(e) => setLineWidth(Number(e.currentTarget.value))}
                />
                <span class="[font-variant-numeric:tabular-nums] text-ui-sm min-w-[56px] text-right">
                  {lineWidth()}ch
                </span>
              </div>

              <div class="grid grid-cols-[80px_1fr_auto] items-center gap-3.5 text-ui-base text-muted">
                <span class="font-medium">Leading</span>
                <input
                  type="range"
                  class="w-full [accent-color:var(--color-accent)]"
                  min="1"
                  max="60"
                  step="0.05"
                  value={lineHeight()}
                  onInput={(e) => setLineHeight(Number(e.currentTarget.value))}
                />
                <span class="[font-variant-numeric:tabular-nums] text-ui-sm min-w-[56px] text-right">
                  {formatLineHeight(lineHeight())}
                </span>
              </div>

              <div class="grid grid-cols-[80px_1fr_auto] items-center gap-3.5 text-ui-base text-muted">
                <span class="font-medium">Tracking</span>
                <input
                  type="range"
                  class="w-full [accent-color:var(--color-accent)]"
                  min="-0.02"
                  max="0.1"
                  step="0.005"
                  value={letterSpacing()}
                  onInput={(e) => setLetterSpacing(Number(e.currentTarget.value))}
                />
                <span class="[font-variant-numeric:tabular-nums] text-ui-sm min-w-[56px] text-right">
                  {letterSpacing().toFixed(3)}em
                </span>
              </div>
            </div>
          </Motion.div>
        </Show>
      </Presence>

      {/* Right drawer is mode-dependent. EGW mode → existing BibleDrawer
          (cross-reference into scripture). Bible mode → symmetric inversion,
          a commentary drawer that surfaces cached EGW paragraphs touching the
          focused verse. Both share the same persisted widthPx so resizing one
          settles the other on next mode switch. */}
      <Show
        when={isBibleMode()}
        fallback={
          <BibleDrawer
            state={bibleDrawer}
            widthPx={bibleDrawerWidth}
            onWidthChange={setBibleDrawerWidth}
            widthBounds={{
              min: BIBLE_DRAWER_WIDTH_BOUNDS.min,
              max: BIBLE_DRAWER_WIDTH_BOUNDS.max,
            }}
            wideWidthPx={bibleDrawerWideWidth}
            onWideWidthChange={setBibleDrawerWideWidth}
            wideWidthBounds={{
              min: BIBLE_DRAWER_WIDE_WIDTH_BOUNDS.min,
              max: BIBLE_DRAWER_WIDE_WIDTH_BOUNDS.max,
            }}
          />
        }
      >
        <BibleCommentaryDrawer widthPx={bibleDrawerWidth} />
      </Show>
    </div>
  );
};
