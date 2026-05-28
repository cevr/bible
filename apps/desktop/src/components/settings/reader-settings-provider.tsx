import { Effect, Fiber } from 'effect';
import {
  type Accessor,
  type Component,
  createContext,
  createMemo,
  type JSX,
  onCleanup,
  useContext,
} from 'solid-js';
import { runtime, signalFromStream } from '../../runtime.js';
import {
  type BibleStudyTab,
  type FontFamily,
  INITIAL_READER_SETTINGS,
  ReaderSettings,
  type ReaderFontScale,
  type ReaderMode,
  type Theme,
  type UiScale,
} from '../../services/reader-settings.js';

// Token table that maps the persisted `FontFamily` enum to the CSS custom
// property fed into `--reader-font-family`. Lives with the provider so the
// SettingsSheet's font swatch buttons (which need to render in the chosen
// face) can pull it from the same source as the reader chrome.
export const FONT_FAMILY_VAR: Record<FontFamily, string> = {
  serif: 'var(--font-serif)',
  sans: 'var(--font-sans)',
  mono: 'var(--font-mono)',
};

export const THEMES: ReadonlyArray<Theme> = ['light', 'sepia', 'dark'];
export const FONT_FAMILIES: ReadonlyArray<FontFamily> = ['serif', 'sans', 'mono'];
export const UI_SCALES: ReadonlyArray<UiScale> = ['sm', 'md', 'lg', 'xl'];
export const UI_SCALE_VALUE: Record<UiScale, number> = {
  sm: 0.875,
  md: 1,
  lg: 1.125,
  xl: 1.25,
};

export const READER_FONT_SCALES: ReadonlyArray<ReaderFontScale> = [
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
  '3xl',
];
export const isReaderFontScale = (v: string): v is ReaderFontScale =>
  (READER_FONT_SCALES as ReadonlyArray<string>).includes(v);
export const isUiScale = (v: string): v is UiScale =>
  (UI_SCALES as ReadonlyArray<string>).includes(v);

export const READER_FONT_PX: Record<ReaderFontScale, number> = {
  sm: 15,
  base: 18,
  lg: 21,
  xl: 24,
  '2xl': 28,
  '3xl': 32,
};

export const FONT_KEY_STEP: Record<
  ReaderFontScale,
  { up: ReaderFontScale; down: ReaderFontScale }
> = {
  sm: { up: 'base', down: 'sm' },
  base: { up: 'lg', down: 'sm' },
  lg: { up: 'xl', down: 'base' },
  xl: { up: '2xl', down: 'lg' },
  '2xl': { up: '3xl', down: 'xl' },
  '3xl': { up: '3xl', down: '2xl' },
};

// Line-height interpretation switches on magnitude (CSS convention):
//   [0, 2]  → unitless multiplier (relative to font-size)
//   (2, _]  → px value (absolute)
// The slider walks both ranges, and the CSS-var emitter picks the unit.
export const UNITLESS_LINE_HEIGHT_MAX = 2;
export const formatLineHeight = (n: number): string =>
  n <= UNITLESS_LINE_HEIGHT_MAX ? n.toFixed(2) : `${String(Math.round(n))}px`;
export const lineHeightCss = (n: number): string =>
  n <= UNITLESS_LINE_HEIGHT_MAX ? String(n) : `${String(Math.round(n))}px`;

export interface ReaderSettingsApi {
  readonly theme: Accessor<Theme>;
  readonly fontFamily: Accessor<FontFamily>;
  readonly fontSize: Accessor<ReaderFontScale>;
  readonly lineHeight: Accessor<number>;
  readonly letterSpacing: Accessor<number>;
  readonly lineWidth: Accessor<number>;
  readonly uiScale: Accessor<UiScale>;
  readonly readerMode: Accessor<ReaderMode>;
  readonly setTheme: (t: Theme) => void;
  readonly setFontFamily: (f: FontFamily) => void;
  readonly setFontSize: (scale: ReaderFontScale) => void;
  readonly setReaderMode: (mode: ReaderMode) => void;
  readonly toggleReaderMode: () => void;
  readonly setUiScale: (scale: UiScale) => void;
  readonly setLineHeight: (n: number) => void;
  readonly setLetterSpacing: (n: number) => void;
  readonly setLineWidth: (n: number) => void;
  readonly cycleTheme: () => void;
  /** Persist the active study tab. The drawer state machine owns the local
   *  in-memory tab; this dispatcher flushes that choice back to ReaderSettings
   *  so a relaunch lands on the same tab. Kept on the same fiber pool as the
   *  typography dispatchers so unmount cleans up any in-flight writes. */
  readonly persistStudyTab: (tab: BibleStudyTab) => void;
}

const ReaderSettingsContext = createContext<ReaderSettingsApi>();

// Lifts the typography signals + persist dispatchers out of `<App>` so the
// settings sheet, global shortcuts, and per-mode views can each read what they
// need without prop-drilling through App. A single `signalFromStream` runs the
// ReaderSettings.changes subscription; per-field memos slice the snapshot.
// Writes go through a shared FiberSet so unmount interrupts any in-flight
// persist effect — symmetric with the existing pattern in app.tsx.
export const ReaderSettingsProvider: Component<{ readonly children: JSX.Element }> = (props) => {
  const settingsState = signalFromStream(
    Effect.gen(function* () {
      const s = yield* ReaderSettings;
      return s.changes;
    }),
    INITIAL_READER_SETTINGS,
  );

  const theme = createMemo(() => settingsState().theme);
  const fontFamily = createMemo(() => settingsState().fontFamily);
  const fontSize = createMemo(() => settingsState().fontSize);
  const lineHeight = createMemo(() => settingsState().lineHeight);
  const letterSpacing = createMemo(() => settingsState().letterSpacing);
  const lineWidth = createMemo(() => settingsState().lineWidth);
  const uiScale = createMemo(() => settingsState().uiScale);
  const readerMode = createMemo(() => settingsState().readerMode);

  // Settings writes accumulate in a FiberSet — interrupted on unmount so a
  // late-resolving setter cannot write to the persisted store after the app
  // root tore down. Mirrors the policy that lived directly on App previously.
  const settingsFibers = new Set<Fiber.Fiber<void>>();
  onCleanup(() => {
    for (const f of settingsFibers) {
      void runtime.runPromise(Fiber.interrupt(f));
    }
    settingsFibers.clear();
  });
  const updateSettings = (effect: Effect.Effect<void, never, ReaderSettings>): void => {
    const fiber = runtime.runFork(
      effect.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            settingsFibers.delete(fiber);
          }),
        ),
      ),
    );
    settingsFibers.add(fiber);
  };

  const setTheme = (t: Theme): void => {
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.themeChosen(t);
      }),
    );
  };
  const setFontFamily = (f: FontFamily): void => {
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.fontFamilyChosen(f);
      }),
    );
  };
  const setFontSize = (scale: ReaderFontScale): void => {
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.fontSizeChosen(scale);
      }),
    );
  };
  const setReaderMode = (mode: ReaderMode): void => {
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.readerModeSwitched(mode);
      }),
    );
  };
  const toggleReaderMode = (): void => {
    setReaderMode(readerMode() === 'egw' ? 'bible' : 'egw');
  };
  const setUiScale = (scale: UiScale): void => {
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.uiScaleChosen(scale);
      }),
    );
  };
  const setLineHeight = (n: number): void => {
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.lineHeightAdjusted(n);
      }),
    );
  };
  const setLetterSpacing = (n: number): void => {
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.letterSpacingAdjusted(n);
      }),
    );
  };
  const setLineWidth = (n: number): void => {
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.lineWidthAdjusted(n);
      }),
    );
  };
  const cycleTheme = (): void => {
    const idx = THEMES.indexOf(theme());
    setTheme(THEMES[(idx + 1) % THEMES.length] ?? 'light');
  };
  const persistStudyTab = (tab: BibleStudyTab): void => {
    updateSettings(
      Effect.gen(function* () {
        const s = yield* ReaderSettings;
        yield* s.studyTabSelected(tab);
      }),
    );
  };

  const api: ReaderSettingsApi = {
    theme,
    fontFamily,
    fontSize,
    lineHeight,
    letterSpacing,
    lineWidth,
    uiScale,
    readerMode,
    setTheme,
    setFontFamily,
    setFontSize,
    setReaderMode,
    toggleReaderMode,
    setUiScale,
    setLineHeight,
    setLetterSpacing,
    setLineWidth,
    cycleTheme,
    persistStudyTab,
  };

  return (
    <ReaderSettingsContext.Provider value={api}>{props.children}</ReaderSettingsContext.Provider>
  );
};

export const useReaderSettingsCtx = (): ReaderSettingsApi => {
  const ctx = useContext(ReaderSettingsContext);
  if (ctx === undefined) {
    throw new Error('useReaderSettingsCtx must be used inside <ReaderSettingsProvider>');
  }
  return ctx;
};
