import { Effect, Fiber, Option, Stream } from 'effect';
import { type Component, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { FolderBrowser } from './components/folder-browser.js';
import { ReaderPane } from './components/reader-pane.js';
import { TocSidebar } from './components/toc-sidebar.js';
import { runtime } from './runtime.js';
import { LastPositionStorage } from './services/last-position-storage.js';
import { Prefetcher } from './services/prefetcher.js';
import {
  type FontFamily,
  ReaderSettings,
  type ReaderFontScale,
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
  const [sheetDragOffset, setSheetDragOffset] = createSignal(0);

  // Reader selection mirror — drives whether we render landing (FolderBrowser)
  // or the reader, and feeds props.selection into ReaderPane.
  const [selection, setSelection] = createSignal<Option.Option<ReaderSelection>>(Option.none());

  // Drawer state. Only meaningful when a book is open.
  const [drawer, setDrawer] = createSignal<DrawerState>('closed');

  // Reset drawers whenever the book is closed (e.g. via Esc, or future close
  // affordance). Keeps the layout coherent: drawers only exist over a reader.
  const closeDrawers = () => setDrawer('closed');

  let searchInputRef: HTMLInputElement | undefined;

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
        if (Option.isNone(restored)) return;
        const pos = restored.value;
        void runtime.runPromise(
          Effect.gen(function* () {
            const state = yield* ReaderState;
            if (Option.isSome(pos.paraId)) {
              yield* state.openChapter(pos.bookId, pos.paraId.value);
            } else {
              yield* state.openBook(pos.bookId);
            }
          }),
        );
      });

    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const state = yield* ReaderState;
        const storage = yield* LastPositionStorage;
        yield* state.changes.pipe(
          Stream.runForEach((next) =>
            Effect.gen(function* () {
              setSelection(next);
              if (Option.isNone(next)) {
                yield* storage.clear;
              } else {
                yield* storage.write({
                  bookId: next.value.bookId,
                  paraId: next.value.chapterParaId,
                });
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

    onCleanup(() => {
      void runtime.runPromise(Fiber.interrupt(fiber));
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

  const cycleTheme = () => {
    const idx = THEMES.indexOf(theme());
    setTheme(THEMES[(idx + 1) % THEMES.length] ?? 'light');
  };

  const closeSheet = () => {
    setSettingsOpen(false);
    setSheetDragOffset(0);
  };

  // Library button cycles drawer state when a book is open. When no book is
  // open the button is hidden (the landing view IS the folder browser).
  const onLibraryClick = () => {
    if (!hasBook()) return;
    setDrawer((curr) => {
      if (curr === 'closed') return 'toc';
      if (curr === 'toc') return 'tocPlusLib';
      return 'closed';
    });
  };

  const focusSearch = () => {
    searchInputRef?.focus();
    searchInputRef?.select();
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
      // Esc closes drawers (no modifier).
      if (e.key === 'Escape' && drawer() !== 'closed') {
        e.preventDefault();
        closeDrawers();
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
      default:
        return;
    }
  };

  onMount(() => {
    window.addEventListener('keydown', onKey);
    onCleanup(() => window.removeEventListener('keydown', onKey));
  });

  let sheetDragStartY: number | null = null;
  const onSheetPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    sheetDragStartY = e.clientY;
    if (e.currentTarget instanceof Element) e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onSheetPointerMove = (e: PointerEvent) => {
    if (sheetDragStartY === null) return;
    const dy = Math.max(0, e.clientY - sheetDragStartY);
    setSheetDragOffset(dy);
  };
  const onSheetPointerUp = (e: PointerEvent) => {
    if (sheetDragStartY === null) return;
    const dy = e.clientY - sheetDragStartY;
    sheetDragStartY = null;
    if (e.currentTarget instanceof Element) e.currentTarget.releasePointerCapture(e.pointerId);
    if (dy > DRAG_CLOSE_THRESHOLD_PX) closeSheet();
    else setSheetDragOffset(0);
  };

  const hasBook = () => Option.isSome(selection());
  const currentBookId = () => {
    const sel = selection();
    return Option.isSome(sel) ? sel.value.bookId : null;
  };

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
  // from. `--reader-*` names match what reader.css consumes (.chapter, .paragraph).
  const readerStyle = () => ({
    '--reader-font-family': FONT_FAMILY_VAR[fontFamily()],
    '--reader-font-size': `${String(READER_FONT_PX[fontSize()])}px`,
    '--reader-line-height': lineHeightCss(lineHeight()),
    '--reader-letter-spacing': `${String(letterSpacing())}em`,
    '--reader-width': `${String(lineWidth())}ch`,
    '--ui-scale': String(UI_SCALE_VALUE[uiScale()]),
  });

  return (
    <div
      class="reader-root"
      data-theme={theme()}
      data-has-book={hasBook() ? 'true' : 'false'}
      style={readerStyle()}
    >
      <header class="titlebar">
        <div class="titlebar-traffic" aria-hidden="true" />
        <Show when={hasBook()}>
          <button
            type="button"
            class="titlebar-btn"
            classList={{
              'is-active': drawer() !== 'closed',
            }}
            onClick={onLibraryClick}
            title="Library"
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
        <div class="titlebar-search-wrap">
          <input
            ref={(el) => (searchInputRef = el)}
            type="search"
            class="titlebar-search"
            placeholder="Search or refcode (⌘K)"
            spellcheck={false}
            autocomplete="off"
          />
        </div>
        <button
          type="button"
          class="titlebar-btn titlebar-btn-icon"
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

      <div class="canvas">
        <Show
          when={hasBook()}
          fallback={
            <div class="landing">
              <FolderBrowser onPickBook={onPickBookFromLanding} />
            </div>
          }
        >
          <ReaderPane selection={selection()} />
        </Show>
      </div>

      {/* Single drawer with two panes. State 1 = just TOC pane visible;
          state 2 = drawer expands and Library pane fades in to the right.
          Mounting both panes regardless of state lets the width transition
          run as a single smooth motion. */}
      <Show when={hasBook() && drawer() !== 'closed'}>
        <div class="drawer-backdrop" onClick={closeDrawers} />
      </Show>

      <Show when={hasBook() && drawer() !== 'closed' && currentBookId() !== null}>
        <aside
          class="drawer"
          classList={{ 'is-expanded': drawer() === 'tocPlusLib' }}
          aria-label="Library and contents"
        >
          <div class="drawer-pane drawer-pane-toc">
            <div class="drawer-header">
              <h2 class="drawer-title">Contents</h2>
              <button
                type="button"
                class="drawer-secondary-btn"
                onClick={() => setDrawer((curr) => (curr === 'tocPlusLib' ? 'toc' : 'tocPlusLib'))}
                title={drawer() === 'tocPlusLib' ? 'Hide library' : 'Open library'}
              >
                {drawer() === 'tocPlusLib' ? 'Close library' : 'Library'}
              </button>
            </div>
            <div class="drawer-body">
              <Show when={currentBookId()} keyed>
                {(bookId) => <TocSidebar bookId={bookId} />}
              </Show>
            </div>
          </div>

          <div class="drawer-pane drawer-pane-library" aria-hidden={drawer() !== 'tocPlusLib'}>
            <div class="drawer-header">
              <h2 class="drawer-title">Library</h2>
            </div>
            <div class="drawer-body">
              <FolderBrowser onPickBook={onPickBookFromDrawer} />
            </div>
          </div>
        </aside>
      </Show>

      <Show when={settingsOpen()}>
        <div class="sheet-backdrop" onClick={closeSheet} />
        <div class="settings-sheet" style={{ transform: `translateY(${sheetDragOffset()}px)` }}>
          <div
            class="sheet-handle"
            onPointerDown={onSheetPointerDown}
            onPointerMove={onSheetPointerMove}
            onPointerUp={onSheetPointerUp}
            onPointerCancel={onSheetPointerUp}
          >
            <div class="sheet-handle-bar" />
          </div>
          <div class="sheet-body">
            <div class="sheet-row">
              <span class="sheet-label">Theme</span>
              <div class="themes">
                <For each={THEMES}>
                  {(t) => (
                    <button
                      type="button"
                      class={`theme theme-${t}${theme() === t ? ' active' : ''}`}
                      onClick={() => setTheme(t)}
                      title={t}
                      aria-label={t}
                    />
                  )}
                </For>
              </div>
              <span class="sheet-value">{theme()}</span>
            </div>

            <div class="sheet-row">
              <span class="sheet-label">Font</span>
              <div class="font-families">
                <For each={FONT_FAMILIES}>
                  {(f) => (
                    <button
                      type="button"
                      class={`font-family${fontFamily() === f ? ' active' : ''}`}
                      style={{ 'font-family': FONT_FAMILY_VAR[f] }}
                      onClick={() => setFontFamily(f)}
                      title={f}
                    >
                      Aa
                    </button>
                  )}
                </For>
              </div>
              <span class="sheet-value">{fontFamily()}</span>
            </div>

            <div class="sheet-row">
              <span class="sheet-label">Size</span>
              <select
                class="sheet-select"
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
              <span class="sheet-value">{READER_FONT_PX[fontSize()]}px</span>
            </div>

            <div class="sheet-row">
              <span class="sheet-label">UI</span>
              <select
                class="sheet-select"
                value={uiScale()}
                onInput={(e) => {
                  const v = e.currentTarget.value;
                  if (isUiScale(v)) setUiScale(v);
                }}
              >
                <For each={UI_SCALES}>{(scale) => <option value={scale}>{scale}</option>}</For>
              </select>
              <span class="sheet-value">{Math.round(UI_SCALE_VALUE[uiScale()] * 100)}%</span>
            </div>

            <div class="sheet-row">
              <span class="sheet-label">Width</span>
              <input
                type="range"
                min="40"
                max="120"
                step="1"
                value={lineWidth()}
                onInput={(e) => setLineWidth(Number(e.currentTarget.value))}
              />
              <span class="sheet-value">{lineWidth()}ch</span>
            </div>

            <div class="sheet-row">
              <span class="sheet-label">Leading</span>
              <input
                type="range"
                min="1"
                max="60"
                step="0.05"
                value={lineHeight()}
                onInput={(e) => setLineHeight(Number(e.currentTarget.value))}
              />
              <span class="sheet-value">{formatLineHeight(lineHeight())}</span>
            </div>

            <div class="sheet-row">
              <span class="sheet-label">Tracking</span>
              <input
                type="range"
                min="-0.02"
                max="0.1"
                step="0.005"
                value={letterSpacing()}
                onInput={(e) => setLetterSpacing(Number(e.currentTarget.value))}
              />
              <span class="sheet-value">{letterSpacing().toFixed(3)}em</span>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
