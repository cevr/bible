import {
  createContext,
  createMemo,
  createSignal,
  onMount,
  Show,
  useContext,
  type ParentProps,
} from 'solid-js';

import { darkTheme, getThemeNames, lightTheme, themes, type Theme } from '../themes/index.js';
import { useBibleState } from './bible.js';

interface ThemeContextValue {
  theme: () => Theme;
  themeName: () => string;
  setTheme: (name: string) => void;
  availableThemes: () => string[];
  cycleTheme: (direction?: 1 | -1) => void;
}

const ThemeContext = createContext<ThemeContextValue>();

// Using interface since @opentui/solid's useRenderer returns untyped
interface RendererColors {
  palette?: (string | null)[];
  defaultBackground?: string | null;
}
type Renderer = {
  getPalette: (config: { size: number }) => Promise<RendererColors>;
};

interface ThemeProviderProps {
  initialTheme?: string;
  renderer: Renderer;
}

// Generate a theme from terminal palette colors
function generateSystemTheme(palette: string[], isDark: boolean): Theme {
  const base = isDark ? darkTheme : lightTheme;

  if (palette.length < 16) {
    return base;
  }

  // ANSI color indices
  const black = palette[0] ?? base.background;
  const red = palette[1] ?? base.error;
  const green = palette[2] ?? base.success;
  const yellow = palette[3] ?? base.warning;
  const blue = palette[4] ?? base.accent;
  const magenta = palette[5] ?? base.accentMuted;
  const cyan = palette[6] ?? base.verseNumber;
  const white = palette[7] ?? base.text;
  const brightBlack = palette[8] ?? base.textMuted;
  const brightWhite = palette[15] ?? base.textHighlight;

  // Use terminal background/foreground if available
  const bg = isDark ? black : brightWhite;
  const fg = isDark ? white : black;

  // Generate panel background by slightly adjusting the base background
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { r: 0, g: 0, b: 0 };
    const rStr = result[1];
    const gStr = result[2];
    const bStr = result[3];
    return {
      r: rStr ? parseInt(rStr, 16) : 0,
      g: gStr ? parseInt(gStr, 16) : 0,
      b: bStr ? parseInt(bStr, 16) : 0,
    };
  };

  const rgbToHex = (r: number, g: number, b: number) =>
    '#' +
    [r, g, b]
      .map((x) => {
        const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('');

  const adjustBrightness = (hex: string, amount: number) => {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(r + amount, g + amount, b + amount);
  };

  const bgPanel = adjustBrightness(bg, isDark ? 15 : -10);
  const border = adjustBrightness(bg, isDark ? 30 : -20);
  const verseHighlight = adjustBrightness(bg, isDark ? 20 : -15);

  return {
    name: 'system',
    background: bg,
    backgroundPanel: bgPanel,
    text: fg,
    textMuted: brightBlack,
    textHighlight: isDark ? brightWhite : black,
    border: border,
    borderFocused: blue,
    accent: blue,
    accentMuted: magenta,
    error: red,
    warning: yellow,
    success: green,
    verseNumber: cyan,
    verseText: fg,
    verseHighlight: verseHighlight,
  };
}

export function ThemeProvider(props: ParentProps<ThemeProviderProps>) {
  const state = useBibleState();
  const prefs = state.getPreferences();

  const [themeName, setThemeNameState] = createSignal(props.initialTheme ?? prefs.theme);
  const [systemTheme, setSystemTheme] = createSignal<Theme | null>(null);
  const [systemMode, setSystemMode] = createSignal<'dark' | 'light'>('dark');
  const [ready, setReady] = createSignal(false);

  // Check for cached palette first (synchronous, no FOUC)
  const cached = state.getCachedPalette();
  if (cached && cached.palette.length >= 16) {
    setSystemMode(cached.isDark ? 'dark' : 'light');
    setSystemTheme(generateSystemTheme(cached.palette, cached.isDark));
    setReady(true);
  }

  // Fetch terminal palette on mount (to update cache)
  onMount(async () => {
    try {
      const colors = await props.renderer.getPalette({ size: 16 });
      // Filter out null values from palette
      const palette = colors.palette?.filter((c): c is string => c !== null);
      if (palette && palette.length >= 16) {
        // Detect if terminal is dark or light based on background luminance
        const bg = colors.defaultBackground ?? palette[0];
        if (bg) {
          const hex = bg.replace('#', '');
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const isDark = luminance < 0.5;
          setSystemMode(isDark ? 'dark' : 'light');
          setSystemTheme(generateSystemTheme(palette, isDark));
          // Cache the palette for next launch
          state.setCachedPalette({ palette, isDark });
        }
      }
    } catch {
      // Fallback to dark theme if palette fetch fails
      if (!systemTheme()) {
        setSystemTheme(darkTheme);
      }
    }
    setReady(true);
  });

  // Only need to wait for system theme if that's what's selected AND no cache
  const isReady = createMemo(() => {
    if (themeName() !== 'system') return true;
    return ready();
  });

  const theme = createMemo(() => {
    const name = themeName();
    if (name === 'system') {
      return systemTheme() ?? (systemMode() === 'dark' ? darkTheme : lightTheme);
    }
    return themes[name] ?? darkTheme;
  });

  const availableThemes = createMemo(() => getThemeNames());

  const setTheme = (name: string) => {
    if (themes[name] || name === 'system') {
      setThemeNameState(name);
      state.setPreferences({ theme: name });
    }
  };

  const cycleTheme = (direction: 1 | -1 = 1) => {
    const names = availableThemes();
    const currentIndex = names.indexOf(themeName());
    const nextIndex = (currentIndex + direction + names.length) % names.length;
    const nextName = names[nextIndex];
    if (nextName) {
      setTheme(nextName);
    }
  };

  const value: ThemeContextValue = {
    theme,
    themeName,
    setTheme,
    availableThemes,
    cycleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      <Show when={isReady()}>{props.children}</Show>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
