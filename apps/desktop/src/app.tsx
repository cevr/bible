import { type Component, createMemo, createSignal, Match, Show, Switch } from 'solid-js';
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
import { createBibleDrawerState } from './services/bible-drawer-state.js';
import {
  transitionDrawer,
  type DrawerAction,
  type DrawerState,
} from './services/drawer-machine.js';
import { createReaderSession } from './services/reader-session.js';

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
  const session = createReaderSession({ settings, bibleDrawer });

  // Drawer state. Only meaningful when a book is open.
  const [drawer, setDrawer] = createSignal<DrawerState>('closed');

  // Reset drawers whenever the book is closed (e.g. via Esc, or future close
  // affordance). Keeps the layout coherent: drawers only exist over a reader.
  const closeDrawers = () =>
    setDrawer((curr) => transitionDrawer(readerMode(), curr, { _tag: 'close' }));

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

  const closeSheet = () => {
    setSettingsOpen(false);
  };

  // Library button cycles drawer state. In EGW mode the button is hidden
  // when no book is open (the landing view IS the folder browser). In Bible
  // mode the TOC is always reachable, and there's no Library pane to expand
  // — the reducer collapses `tocPlusLib` to a no-op there.
  const dispatchDrawer = (action: DrawerAction): void => {
    setDrawer((curr) => transitionDrawer(readerMode(), curr, action));
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

  const hasBook = session.hasEgwBook;
  const currentBookId = session.currentEgwBookId;

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

      <Show when={!session.mainReady()}>
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
            onClick={session.dismissRuntimeWarning}
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
              bibleTocSelection={session.bibleTocSelection}
              bibleSelection={session.bibleSelection}
              paletteOpen={paletteOpen}
              setPaletteOpen={setPaletteOpen}
            />
          </Match>
          <Match when={!isBibleMode()}>
            <EgwModeView
              selection={session.egwSelection}
              rehydrated={session.rehydrated}
              restoreParagraphId={session.restoreParagraphId}
              readerFontFamily={readerFontFamily}
              onHighlightApplied={session.onHighlightApplied}
              onParagraphScrolledIntoView={session.onParagraphScrolledIntoView}
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
