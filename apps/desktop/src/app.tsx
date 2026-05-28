import { Effect, Fiber, Option, Schedule, Stream } from 'effect';
import {
  batch,
  type Component,
  createMemo,
  createSignal,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js';
import { BibleDrawer } from './components/bible-drawer.js';
import { GlobalShortcuts } from './components/global-shortcuts.js';
import { BibleModeView } from './components/modes/bible-mode-view.js';
import { EgwModeView } from './components/modes/egw-mode-view.js';
import { HeaderSearchInput } from './components/modes/header-search-input.js';
import { PaletteButton } from './components/modes/palette-button.js';
import { SearchPanel } from './components/search-panel.js';
import {
  FONT_FAMILY_VAR,
  lineHeightCss,
  READER_FONT_PX,
  ReaderSettingsProvider,
  UI_SCALE_VALUE,
  useReaderSettingsCtx,
} from './components/settings/reader-settings-provider.js';
import { SettingsSheet } from './components/settings/settings-sheet.js';
import { BibleReaderState, type BibleReaderSelection } from './services/bible-reader-state.js';
import { createBibleDrawerState } from './services/bible-drawer-state.js';
import { createDebouncedAction } from './lib/debounced-action.js';
import { runtime, signalFromStream } from './runtime.js';
import { lastChapterMemory } from './services/last-chapter-memory.js';
import { type LastPosition, LastPositionStorage } from './services/last-position-storage.js';
import { openBookAtFirstChapter } from './services/open-book.js';
import { Prefetcher } from './services/prefetcher.js';
import { ReaderSettings, type ReaderMode } from './services/reader-settings.js';
import { ReaderState, type ReaderSelection } from './services/reader-state.js';
import { UrlStateRouter, type UrlSelection } from './services/url-state-router.js';

// Three-layer drawer stack for the open-book flow:
//   - 'closed'      reader fills canvas
//   - 'toc'         TOC slides in over reader
//   - 'tocPlusLib'  Library explorer slides in on top of TOC
// State only applies when a book is open. Closing the book resets to 'closed'.
export type DrawerState = 'closed' | 'toc' | 'tocPlusLib';

// Mode-aware drawer transition reducer. `tocPlusLib` is only meaningful
// in EGW mode (Bible mode has no Library pane); routing every transition
// through this reducer means invalid combinations like
// (mode='bible', drawer='tocPlusLib') become no-ops instead of being
// reachable via a `setDrawer('tocPlusLib')` call from the wrong code path.
type DrawerAction =
  | { readonly _tag: 'libraryClick' }
  | { readonly _tag: 'toggleLibraryPane' }
  | { readonly _tag: 'close' };
const drawerReducer = (mode: ReaderMode, curr: DrawerState, action: DrawerAction): DrawerState => {
  if (action._tag === 'close') return 'closed';
  if (mode === 'bible') {
    // Bible mode: only `toc` is reachable; `tocPlusLib` is collapsed to
    // `toc` if a stale transition somehow asked for it.
    if (action._tag === 'libraryClick') return curr === 'closed' ? 'toc' : 'closed';
    if (action._tag === 'toggleLibraryPane') return curr;
    return curr;
  }
  // EGW mode: closed → toc → tocPlusLib → closed cycle.
  if (action._tag === 'libraryClick') {
    if (curr === 'closed') return 'toc';
    if (curr === 'toc') return 'tocPlusLib';
    return 'closed';
  }
  if (action._tag === 'toggleLibraryPane') {
    return curr === 'tocPlusLib' ? 'toc' : 'tocPlusLib';
  }
  return curr;
};

const AppInner: Component = () => {
  // Typography signals + persist dispatchers come from <ReaderSettingsProvider>
  // — see components/settings/reader-settings-provider.tsx. The provider owns
  // the single `ReaderSettings.changes` subscription and the FiberSet that
  // tracks in-flight persist writes; consumers read accessors and call
  // setters without touching the service directly.
  const settings = useReaderSettingsCtx();
  // Overlay stack: settings / search / palette can all logically be open,
  // but only the top of the stack is interactive. Esc pops the top. The
  // priority order baked into the Esc handler (palette > search > settings/drawer)
  // is enforced by stack push order, not by three independent booleans.
  type Overlay = 'settings' | 'search' | 'palette';
  const [overlayStack, setOverlayStack] = createSignal<readonly Overlay[]>([]);
  const isOverlayOpen = (o: Overlay): boolean => overlayStack().includes(o);
  const pushOverlay = (o: Overlay): void => {
    setOverlayStack((s) => (s.includes(o) ? s : [...s, o]));
  };
  const popOverlay = (o: Overlay): void => {
    setOverlayStack((s) => s.filter((x) => x !== o));
  };
  const topOverlay = (): Overlay | undefined => overlayStack().at(-1);
  const settingsOpen = (): boolean => isOverlayOpen('settings');
  const setSettingsOpen = (next: boolean | ((open: boolean) => boolean)): void => {
    const open = typeof next === 'function' ? next(settingsOpen()) : next;
    if (open) pushOverlay('settings');
    else popOverlay('settings');
  };
  // Top-level reader mode — read via the provider. Persisted in ReaderSettings
  // so a relaunch lands the user in whichever mode they left in.
  const readerMode = settings.readerMode;

  // Right-side study drawer — one instance for the whole app, mounted in
  // both modes. EGW mode opens it via ScriptureRef clicks (the existing
  // `onScriptureClick` callback); Bible mode opens it from verse-gutter /
  // margin-note / Strong's-super / `e` marker clicks on the chapter canvas.
  //
  // Persistence is wired into the state machine via `persistTab` so the
  // service stays the single source of truth — no parallel mirror here.
  const bibleDrawer = createBibleDrawerState({
    persistTab: (tab) => settings.persistStudyTab(tab),
  });

  // True once the main-process Effect runtime is up. Polled on mount and
  // again once per second until it flips true. When false, we paint a
  // dismissable banner across the top of the canvas — without it every IPC
  // returns empty/null and the UI ends up rendering misleading "missing data"
  // screens. Most common cause is a hot-reload that left a stale Electron
  // running its old main bundle (see electron-dev plugin restart hardening).
  const [mainReady, setMainReady] = createSignal<boolean>(true);

  // Reader selection mirror — drives whether we render landing (FolderBrowser)
  // or the reader, and feeds props.selection into ReaderPane.
  const [selection, setSelection] = createSignal<Option.Option<ReaderSelection>>(Option.none());

  // Bible-mode selection — projected directly from BibleReaderState's
  // SubscriptionRef. Used so the Bible TOC drawer can highlight the active
  // book/chapter, and so the shell can decide whether the right commentary
  // drawer should mount. Storage + lastChapterMemory writes live in a
  // separate persistence fiber below.
  const bibleSelection = signalFromStream(
    Effect.gen(function* () {
      const state = yield* BibleReaderState;
      return state.changes;
    }),
    Option.none<BibleReaderSelection>(),
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
  const closeDrawers = () =>
    setDrawer((curr) => drawerReducer(readerMode(), curr, { _tag: 'close' }));

  const [searchInputRef, setSearchInputRef] = createSignal<HTMLInputElement | undefined>(undefined);
  const [searchQuery, setSearchQuery] = createSignal('');
  const searchOpen = (): boolean => isOverlayOpen('search');
  const closeSearch = (): void => {
    popOverlay('search');
  };
  const openSearch = (): void => {
    pushOverlay('search');
  };

  // Bible-mode Cmd+K palette. Repurposes the shortcut when the user is in
  // Bible mode (where the header search box doesn't apply); EGW mode keeps
  // its existing behavior of focusing the header search.
  const paletteOpen = (): boolean => isOverlayOpen('palette');
  const setPaletteOpen = (next: boolean | ((open: boolean) => boolean)): void => {
    const open = typeof next === 'function' ? next(paletteOpen()) : next;
    if (open) pushOverlay('palette');
    else popOverlay('palette');
  };

  onMount(() => {
    // Poll the diag IPC until main reports ready. We assume ready until told
    // otherwise so first-paint isn't gated on the roundtrip; if the first poll
    // says "not ready" we flip the banner on and keep polling every second
    // until it flips true. Effect.repeat owns the cancellation — the fiber is
    // interrupted via onCleanup so the polling stops on unmount.
    const checkReady = Effect.tryPromise(() => window.api.diag.runtimeReady()).pipe(
      Effect.orElseSucceed(() => false),
      Effect.tap((ready) => Effect.sync(() => setMainReady(ready))),
    );
    const pollFiber = runtime.runFork(
      checkReady.pipe(
        Effect.repeat({
          schedule: Schedule.spaced('1 second'),
          until: (ready: boolean) => ready,
        }),
      ),
    );
    onCleanup(() => {
      runtime.runFork(Fiber.interrupt(pollFiber));
    });

    // Seed the bible drawer's active study tab from persisted settings.
    // Every other persisted field flows through `settingsState`'s subscription
    // and reactive memos — the drawer is the one consumer that needs a
    // one-shot non-persisting setter (re-writing the tab back to disk on
    // every launch would be redundant).
    const drawerSeedFiber = runtime.runFork(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        const state = yield* s.get;
        bibleDrawer.seedActiveStudyTab(state.bibleStudyTab);
      }),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(drawerSeedFiber));
    });

    // URL hash → boot selection. Read synchronously so the rehydration
    // fibers below can gate on it without racing a Promise. The router's
    // `read` is `Effect.sync` under the hood, so `runSync` is safe.
    //
    // A7-01: the URL is the canonical state store. When the hash names a
    // valid selection we use it INSTEAD of LastPositionStorage for the
    // matching mode, and switch readerMode to match the hash. The other
    // mode still rehydrates from storage so a mode-flip mid-session lands
    // on the user's persisted place there.
    const bootUrlSelection: Option.Option<UrlSelection> = runtime.runSync(
      Effect.gen(function* () {
        const router = yield* UrlStateRouter;
        return yield* router.read;
      }),
    );
    const urlSelectsBible =
      Option.isSome(bootUrlSelection) &&
      (bootUrlSelection.value._tag === 'bible-chapter' ||
        bootUrlSelection.value._tag === 'bible-verse');
    const urlSelectsEgw =
      Option.isSome(bootUrlSelection) &&
      (bootUrlSelection.value._tag === 'egw-book' ||
        bootUrlSelection.value._tag === 'egw-chapter' ||
        bootUrlSelection.value._tag === 'egw-highlight');
    // Switch readerMode to match the URL before any storage reads — keeps
    // the first-paint canvas aligned with the hash even if persisted mode
    // disagrees (e.g. user shared a `#/bible/...` link while EGW was last
    // open).
    if (urlSelectsBible) settings.setReaderMode('bible');
    if (urlSelectsEgw) settings.setReaderMode('egw');

    // Rehydrate last position on mount, then mirror + persist every change.
    // The rehydration replays into ReaderState (openBook/openChapter), which
    // fires `changes` and persists the same value back — harmless one-row
    // upsert. Persisting from the same fiber that mirrors keeps the order
    // deterministic: the signal updates before the disk write returns.
    //
    // URL hash takes precedence: when the boot hash names an EGW selection
    // we replay it instead of the persisted position, then mark rehydrated
    // so the canvas shows. The restore anchor (paragraphId) is only set
    // from `egw-highlight` URLs, mirroring the LastPositionStorage path.
    const egwRehydrateFiber = runtime.runFork(
      Effect.gen(function* () {
        if (urlSelectsEgw && Option.isSome(bootUrlSelection)) {
          const url = bootUrlSelection.value;
          const state = yield* ReaderState;
          if (url._tag === 'egw-book') {
            yield* openBookAtFirstChapter(url.bookId);
          } else if (url._tag === 'egw-chapter') {
            yield* state.openChapter(url.bookId, url.chapterParaId);
          } else {
            // egw-highlight: seed the restore anchor BEFORE the openChapterAt
            // so BookFeed scrolls without a flicker on first render.
            setRestoreParagraphId(Option.some(url.highlightParaId));
            latestAnchorParaId = url.highlightParaId;
            pendingRestoreEmit = true;
            yield* state.openChapterAt(url.bookId, url.chapterParaId, url.highlightParaId);
          }
          setRehydrated(true);
          return;
        }
        const storage = yield* LastPositionStorage;
        const restored = yield* storage.read;
        if (Option.isNone(restored)) {
          setRehydrated(true);
          return;
        }
        const pos = restored.value;
        // Seed the restore anchor BEFORE opening the chapter so BookFeed sees
        // it on first render and can scroll-to-restore without flicker.
        if (pos._tag === 'paragraph') {
          setRestoreParagraphId(Option.some(pos.paragraphId));
          latestAnchorParaId = pos.paragraphId;
          pendingRestoreEmit = true;
        }
        if (pos._tag === 'book') {
          // Persisted bookId with no chapter (e.g. user closed before
          // picking one) — auto-resolve to the first chapter rather
          // than restoring into the "Pick a chapter" empty state.
          yield* openBookAtFirstChapter(pos.bookId);
        } else {
          const state = yield* ReaderState;
          yield* state.openChapter(pos.bookId, pos.paraId);
        }
        setRehydrated(true);
      }).pipe(
        Effect.tapError((err) =>
          Effect.sync(() => {
            console.error('[rehydrate] EGW position failed', err);
            setRehydrated(true);
          }),
        ),
        Effect.ignore,
      ),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(egwRehydrateFiber));
    });

    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const state = yield* ReaderState;
        const storage = yield* LastPositionStorage;
        yield* state.changes.pipe(
          Stream.runForEach((next) =>
            Effect.gen(function* () {
              const prev = selection();
              // Compute restore-clear decision before mutating any signals so
              // we can batch the writes. Without batching, `setSelection` fires
              // the `<Show keyed>` remount synchronously and the new BookFeed
              // reads `restoreParagraphId()` *before* we clear it — landing on
              // the stale paragraph from the previous chapter instead of the
              // new chapter break.
              const prevSel = Option.getOrUndefined(prev);
              const nextChapterParaId = Option.isSome(next)
                ? next.value._tag === 'book'
                  ? null
                  : next.value.chapterParaId
                : null;
              const prevChapterParaId =
                prevSel !== undefined && prevSel._tag !== 'book' ? prevSel.chapterParaId : null;
              const sameChapter =
                Option.isSome(next) &&
                prevSel !== undefined &&
                prevSel.bookId === next.value.bookId &&
                prevChapterParaId !== null &&
                nextChapterParaId !== null &&
                prevChapterParaId === nextChapterParaId;
              const shouldClearRestore =
                Option.isNone(next) || (!sameChapter && !pendingRestoreEmit);
              if (shouldClearRestore) {
                latestAnchorParaId = null;
              }
              batch(() => {
                setSelection(next);
                if (shouldClearRestore) {
                  setRestoreParagraphId(Option.none());
                }
              });
              pendingRestoreEmit = false;
              if (Option.isNone(next)) {
                yield* storage.clear;
              } else {
                const v = next.value;
                const position: LastPosition =
                  v._tag === 'book'
                    ? { _tag: 'book', bookId: v.bookId }
                    : latestAnchorParaId === null
                      ? { _tag: 'chapter', bookId: v.bookId, paraId: v.chapterParaId }
                      : {
                          _tag: 'paragraph',
                          bookId: v.bookId,
                          paraId: v.chapterParaId,
                          paragraphId: latestAnchorParaId,
                        };
                yield* storage.write(position);
                if (v._tag !== 'book') {
                  lastChapterMemory.recordEgw(v.bookId, v.chapterParaId);
                }
              }
            }),
          ),
        );
      }),
    );

    // Rehydrate Bible-mode last position on mount. Symmetric with the EGW
    // restore above: read the persisted row, replay it into BibleReaderState
    // (which fires `changes` and persists the same value back — harmless
    // one-row upsert through the mirror fiber).
    //
    // URL hash takes precedence: when the boot hash names a Bible selection
    // we replay it instead of the persisted position.
    const bibleRehydrateFiber = runtime.runFork(
      Effect.gen(function* () {
        if (urlSelectsBible && Option.isSome(bootUrlSelection)) {
          const url = bootUrlSelection.value;
          const state = yield* BibleReaderState;
          if (url._tag === 'bible-verse') {
            yield* state.openChapterAt(url.book, url.chapter, url.verse);
          } else if (url._tag === 'bible-chapter') {
            yield* state.openChapter(url.book, url.chapter);
          }
          return;
        }
        const storage = yield* LastPositionStorage;
        const restored = yield* storage.readBible;
        if (Option.isNone(restored)) return;
        const pos = restored.value;
        const state = yield* BibleReaderState;
        if (pos._tag === 'verse') {
          yield* state.openChapterAt(pos.book, pos.chapter, pos.verse);
        } else {
          yield* state.openChapter(pos.book, pos.chapter);
        }
      }).pipe(
        Effect.tapError((err) =>
          Effect.sync(() => {
            console.error('[rehydrate] bible position failed', err);
          }),
        ),
        Effect.ignore,
      ),
    );
    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(bibleRehydrateFiber));
    });

    // Bible-mode persistence fiber. The local accessor is derived directly
    // from BibleReaderState's changes stream above; this fiber is purely
    // about persisting the (book, chapter, verse) on every change so a
    // refresh/restart restores the user's place, plus the session-scoped
    // last-chapter memory used for book-hopping continuity.
    const bibleFiber = runtime.runFork(
      Effect.gen(function* () {
        const state = yield* BibleReaderState;
        const storage = yield* LastPositionStorage;
        yield* state.changes.pipe(
          Stream.runForEach((next) =>
            Effect.gen(function* () {
              if (Option.isNone(next)) {
                yield* storage.clearBible;
              } else {
                const v = next.value;
                yield* storage.writeBible(
                  v._tag === 'verse'
                    ? { _tag: 'verse', book: v.book, chapter: v.chapter, verse: v.verse }
                    : { _tag: 'chapter', book: v.book, chapter: v.chapter },
                );
                lastChapterMemory.recordBible(v.book, v.chapter);
              }
            }),
          ),
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

    // A7-01: URL hash mirror. Subscribe to the THREE inputs that determine
    // the canonical hash — reader mode (which mode's selection counts), and
    // the two selection streams. On every emit snapshot all three and write
    // the resulting URL via `history.replaceState`. The router's `write`
    // no-ops when the encoded value matches the current hash, so this is
    // cheap even when streams fire faster than the URL needs updating.
    const computeUrlSelection = (
      mode: ReaderMode,
      egw: Option.Option<ReaderSelection>,
      bible: Option.Option<BibleReaderSelection>,
    ): Option.Option<UrlSelection> => {
      if (mode === 'bible') {
        if (Option.isNone(bible)) return Option.none();
        const v = bible.value;
        if (v._tag === 'verse') {
          return Option.some({
            _tag: 'bible-verse',
            book: v.book,
            chapter: v.chapter,
            verse: v.verse,
          });
        }
        return Option.some({ _tag: 'bible-chapter', book: v.book, chapter: v.chapter });
      }
      if (Option.isNone(egw)) return Option.none();
      const v = egw.value;
      if (v._tag === 'book') return Option.some({ _tag: 'egw-book', bookId: v.bookId });
      if (v._tag === 'chapter') {
        return Option.some({
          _tag: 'egw-chapter',
          bookId: v.bookId,
          chapterParaId: v.chapterParaId,
        });
      }
      return Option.some({
        _tag: 'egw-highlight',
        bookId: v.bookId,
        chapterParaId: v.chapterParaId,
        highlightParaId: v.highlightParaId,
      });
    };
    const urlMirrorFiber = runtime.runFork(
      Effect.gen(function* () {
        const router = yield* UrlStateRouter;
        const egwState = yield* ReaderState;
        const bibleState = yield* BibleReaderState;
        const settingsSvc = yield* ReaderSettings;
        // Tag each input stream so a single `merge` produces one merged
        // event channel; we re-fetch every input on every emit because the
        // canonical hash depends on all three.
        const modes = settingsSvc.changes.pipe(Stream.map((s) => ({ _tag: 'mode' as const, s })));
        const egws = egwState.changes.pipe(Stream.map((s) => ({ _tag: 'egw' as const, s })));
        const bibles = bibleState.changes.pipe(Stream.map((s) => ({ _tag: 'bible' as const, s })));
        yield* Stream.merge(modes, Stream.merge(egws, bibles)).pipe(
          Stream.runForEach(() =>
            Effect.gen(function* () {
              const settingsSnap = yield* settingsSvc.get;
              const egwSnap = yield* egwState.get;
              const bibleSnap = yield* bibleState.get;
              const url = computeUrlSelection(settingsSnap.readerMode, egwSnap, bibleSnap);
              yield* router.write(url);
            }),
          ),
        );
      }),
    );

    // A7-01: popstate handler. When the user hits back/forward, decode the
    // resulting hash and replay it into whichever state machine the URL
    // names. Symmetric with the boot read above — the same precedence rules
    // (URL switches readerMode) apply.
    const popstateFiber = runtime.runFork(
      Effect.gen(function* () {
        const router = yield* UrlStateRouter;
        const egwState = yield* ReaderState;
        const bibleState = yield* BibleReaderState;
        yield* router.popstate.pipe(
          Stream.runForEach((sel) =>
            Effect.gen(function* () {
              if (Option.isNone(sel)) return;
              const url = sel.value;
              if (url._tag === 'bible-chapter') {
                settings.setReaderMode('bible');
                yield* bibleState.openChapter(url.book, url.chapter);
              } else if (url._tag === 'bible-verse') {
                settings.setReaderMode('bible');
                yield* bibleState.openChapterAt(url.book, url.chapter, url.verse);
              } else if (url._tag === 'egw-book') {
                settings.setReaderMode('egw');
                yield* openBookAtFirstChapter(url.bookId);
              } else if (url._tag === 'egw-chapter') {
                settings.setReaderMode('egw');
                yield* egwState.openChapter(url.bookId, url.chapterParaId);
              } else {
                settings.setReaderMode('egw');
                yield* egwState.openChapterAt(url.bookId, url.chapterParaId, url.highlightParaId);
              }
            }),
          ),
        );
      }),
    );

    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(fiber));
      void runtime.runPromise(Fiber.interrupt(bibleFiber));
      void runtime.runPromise(Fiber.interrupt(prefetchFiber));
      void runtime.runPromise(Fiber.interrupt(urlMirrorFiber));
      void runtime.runPromise(Fiber.interrupt(popstateFiber));
    });
  });

  const closeSheet = () => {
    setSettingsOpen(false);
  };

  // Library button cycles drawer state. In EGW mode the button is hidden
  // when no book is open (the landing view IS the folder browser). In Bible
  // mode the TOC is always reachable, and there's no Library pane to expand
  // — the reducer collapses `tocPlusLib` to a no-op there.
  const dispatchDrawer = (action: DrawerAction): void => {
    setDrawer((curr) => drawerReducer(readerMode(), curr, action));
  };
  const onLibraryClick = () => {
    if (!libraryAvailable()) return;
    dispatchDrawer({ _tag: 'libraryClick' });
  };

  const focusSearch = () => {
    const el = searchInputRef();
    el?.focus();
    el?.select();
    openSearch();
  };

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

  // Shell-level write fibers — clearHighlight + position flushes. Joined on
  // unmount so a pending write isn't truncated, then any survivors are
  // interrupted. (Writes here are short SQLite upserts; the join keeps the
  // last intent durable across a remount during HMR.)
  const writeFibers = new Set<Fiber.Fiber<void>>();
  onCleanup(() => {
    const pending = [...writeFibers];
    if (pending.length === 0) return;
    void runtime.runPromise(Fiber.joinAll(pending).pipe(Effect.ignore));
    writeFibers.clear();
  });
  const forkWrite = (
    eff: Effect.Effect<void, unknown, ReaderState | LastPositionStorage>,
  ): void => {
    const fiber = runtime.runFork(
      eff.pipe(
        Effect.tapError(Effect.logError),
        Effect.ignore,
        Effect.ensuring(
          Effect.sync(() => {
            writeFibers.delete(fiber);
          }),
        ),
      ),
    );
    writeFibers.add(fiber);
  };

  // ReaderPane reports when it has scrolled-to and flashed the highlighted
  // paragraph (search-result jump). Clear the highlight on ReaderState so a
  // re-render of the same chapter doesn't re-scroll.
  const onHighlightApplied = () => {
    forkWrite(
      Effect.gen(function* () {
        const state = yield* ReaderState;
        yield* state.clearHighlight;
      }),
    );
  };

  // Scroll-spy anchor moved — persist the new (chapter, paragraph) pair so
  // a relaunch restores at the topmost visible paragraph rather than just
  // the chapter start.
  //
  // The renderer can fire this on every scroll frame; the underlying IPC
  // write is a sync SQLite upsert behind an async Promise, and bursts of
  // 60+ writes/sec from a wheel scroll can land out of order in the main
  // process — so refresh would read whichever intermediate happened to
  // commit last. We debounce to 250ms trailing-edge and flush on chapter
  // swap or window unload so the *latest* intent always wins.
  interface PositionPayload {
    readonly bookId: number;
    readonly chapterParaId: string;
    readonly paragraphParaId: string;
  }
  let pendingChapterKey: string | undefined;
  const positionWriter = createDebouncedAction<PositionPayload>((p) => {
    pendingChapterKey = undefined;
    forkWrite(
      Effect.gen(function* () {
        const storage = yield* LastPositionStorage;
        yield* storage.write({
          _tag: 'paragraph',
          bookId: p.bookId,
          paraId: p.chapterParaId,
          paragraphId: p.paragraphParaId,
        });
      }),
    );
  }, 250);
  const chapterKeyOf = (bookId: number, chapterParaId: string): string =>
    `${String(bookId)}:${chapterParaId}`;
  const onParagraphScrolledIntoView = (chapterParaId: string, paragraphParaId: string) => {
    latestAnchorParaId = paragraphParaId;
    const sel = selection();
    if (Option.isNone(sel)) return;
    const bookId = sel.value.bookId;
    const nextKey = chapterKeyOf(bookId, chapterParaId);
    // Flush immediately if the chapter/book changed under us — debouncing
    // across chapters would drop a position write for the chapter we just
    // left.
    if (pendingChapterKey !== undefined && pendingChapterKey !== nextKey) {
      positionWriter.flush();
    }
    pendingChapterKey = nextKey;
    positionWriter.schedule({ bookId, chapterParaId, paragraphParaId });
  };
  // Flush on window unload (refresh, close) so the user's actual last scroll
  // position survives even when the debounce hasn't fired.
  onMount(() => {
    const onUnload = (): void => positionWriter.flush();
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
    onCleanup(() => {
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide', onUnload);
    });
  });

  // Reader CSS-var bridge — these have to be on a root the chapter inherits
  // from. `--reader-*` names are consumed via arbitrary Tailwind value escapes
  // in BookFeed (`text-[length:var(--reader-font-size,18px)]` etc.) so the
  // chapter typography stays driven by these inline custom properties.
  // Resolved font-family token (after FONT_FAMILY_VAR mapping). Threaded
  // into ReaderPane so BookFeed's metrics probe re-samples on font change —
  // pretext's height cache is keyed by font, and stale predictions overlap rows.
  const readerFontFamily = createMemo(() => FONT_FAMILY_VAR[settings.fontFamily()]);

  const readerStyle = () => ({
    '--reader-font-family': readerFontFamily(),
    '--reader-font-size': `${String(READER_FONT_PX[settings.fontSize()])}px`,
    '--reader-line-height': lineHeightCss(settings.lineHeight()),
    '--reader-letter-spacing': `${String(settings.letterSpacing())}em`,
    '--reader-width': `${String(settings.lineWidth())}ch`,
    '--ui-scale': String(UI_SCALE_VALUE[settings.uiScale()]),
  });

  return (
    <div
      class="h-screen grid grid-rows-[auto_1fr] bg-bg text-fg transition-[background-color,color] duration-150 ease-in-out"
      data-theme={settings.theme()}
      data-has-book={hasBook() ? 'true' : 'false'}
      style={readerStyle()}
    >
      <GlobalShortcuts
        isBibleMode={isBibleMode}
        drawer={drawer}
        topOverlay={topOverlay}
        setPaletteOpen={setPaletteOpen}
        focusSearch={focusSearch}
        closeDrawers={closeDrawers}
        popOverlay={popOverlay}
        closeSearch={closeSearch}
        searchInputRef={searchInputRef}
        setSettingsOpen={setSettingsOpen}
      />
      <header class="flex items-center gap-2.5 px-3 py-2 h-[calc(44px*var(--ui-scale))] border-b border-rule bg-[color-mix(in_srgb,var(--color-bg)_90%,transparent)] backdrop-blur-md [-webkit-app-region:drag] z-[5]">
        <div class="w-[70px] flex-[0_0_70px]" aria-hidden="true" />
        <div
          class="inline-flex items-center gap-0 rounded-md border border-rule overflow-hidden [-webkit-app-region:no-drag]"
          role="group"
          aria-label="Reader mode"
        >
          <button
            type="button"
            class="inline-flex items-center justify-center h-[calc(28px*var(--ui-scale))] px-3 bg-transparent text-muted text-ui-base font-medium cursor-pointer transition-[background,color,box-shadow] duration-[0.12s] ease-in-out hover:text-fg hover:bg-[color-mix(in_srgb,var(--color-fg)_6%,transparent)] hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] focus-visible:outline-none data-active:bg-accent data-active:text-bg data-active:font-semibold data-active:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-fg)_8%,transparent)]"
            data-active={readerMode() === 'egw' ? '' : undefined}
            onClick={() => settings.setReaderMode('egw')}
            title="EGW books (⌘M)"
            aria-label="EGW mode"
            aria-pressed={readerMode() === 'egw'}
          >
            EGW
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center h-[calc(28px*var(--ui-scale))] px-3 bg-transparent text-muted text-ui-base font-medium cursor-pointer border-l border-rule transition-[background,color,box-shadow] duration-[0.12s] ease-in-out hover:text-fg hover:bg-[color-mix(in_srgb,var(--color-fg)_6%,transparent)] hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] focus-visible:outline-none data-active:bg-accent data-active:text-bg data-active:font-semibold data-active:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-fg)_8%,transparent)]"
            data-active={readerMode() === 'bible' ? '' : undefined}
            onClick={() => settings.setReaderMode('bible')}
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
          <Switch>
            <Match when={isBibleMode()}>
              <PaletteButton onOpen={() => setPaletteOpen(true)} />
            </Match>
            <Match when={!isBibleMode()}>
              <HeaderSearchInput
                setSearchInputRef={setSearchInputRef}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                openSearch={openSearch}
              />
            </Match>
          </Switch>
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

      <Show when={!mainReady()}>
        <div
          role="alert"
          class="flex items-center justify-between gap-3 px-4 py-2 bg-danger-soft border-b border-danger text-ui-sm text-danger"
        >
          <span>
            Main process not ready — IPC calls will return empty. Restart{' '}
            <code class="font-mono">bun run dev</code> to recover.
          </span>
          <button
            type="button"
            class="text-ui-xs opacity-70 hover:opacity-100 underline cursor-pointer bg-transparent border-0 p-0"
            onClick={() => setMainReady(true)}
            title="Hide banner (poll continues in background)"
          >
            dismiss
          </button>
        </div>
      </Show>

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

      <div class="relative min-h-0 overflow-hidden flex-1">
        <Switch>
          <Match when={isBibleMode()}>
            <BibleModeView
              drawer={drawer}
              closeDrawers={closeDrawers}
              bibleDrawer={bibleDrawer}
              bibleTocSelection={bibleTocSelection}
              bibleSelection={bibleSelection}
              paletteOpen={paletteOpen}
              setPaletteOpen={setPaletteOpen}
            />
          </Match>
          <Match when={!isBibleMode()}>
            <EgwModeView
              selection={selection}
              rehydrated={rehydrated}
              restoreParagraphId={restoreParagraphId}
              readerFontFamily={readerFontFamily}
              onHighlightApplied={onHighlightApplied}
              onParagraphScrolledIntoView={onParagraphScrolledIntoView}
              onPickBookFromLanding={onPickBookFromLanding}
              onPickBookFromDrawer={onPickBookFromDrawer}
              bibleDrawer={bibleDrawer}
              drawer={drawer}
              closeDrawers={closeDrawers}
              toggleLibraryPane={() => dispatchDrawer({ _tag: 'toggleLibraryPane' })}
              currentBookId={currentBookId}
            />
          </Match>
        </Switch>

        {/* Right drawer — unified verse-pinned study drawer in both modes. */}
        <BibleDrawer state={bibleDrawer} />
      </div>

      <SettingsSheet open={settingsOpen()} onClose={closeSheet} />
    </div>
  );
};

export const App: Component = () => (
  <ReaderSettingsProvider>
    <AppInner />
  </ReaderSettingsProvider>
);
