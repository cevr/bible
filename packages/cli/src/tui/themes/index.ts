// Theme types and registry

export interface Theme {
  name: string;
  background: string;
  backgroundPanel: string;
  text: string;
  textMuted: string;
  textHighlight: string;
  border: string;
  borderFocused: string;
  accent: string;
  accentMuted: string;
  error: string;
  warning: string;
  success: string;
  // Verse-specific colors
  verseNumber: string;
  verseText: string;
  verseHighlight: string;
}

// Dark theme (default)
export const darkTheme: Theme = {
  name: 'dark',
  background: '#0a0a0a',
  backgroundPanel: '#141414',
  text: '#e5e5e5',
  textMuted: '#737373',
  textHighlight: '#fafafa',
  border: '#262626',
  borderFocused: '#3b82f6',
  accent: '#3b82f6',
  accentMuted: '#1d4ed8',
  error: '#ef4444',
  warning: '#f59e0b',
  success: '#22c55e',
  verseNumber: '#60a5fa',
  verseText: '#d4d4d4',
  verseHighlight: '#1e3a5f',
};

// Light theme
export const lightTheme: Theme = {
  name: 'light',
  background: '#ffffff',
  backgroundPanel: '#f5f5f5',
  text: '#171717',
  textMuted: '#737373',
  textHighlight: '#000000',
  border: '#e5e5e5',
  borderFocused: '#2563eb',
  accent: '#2563eb',
  accentMuted: '#3b82f6',
  error: '#dc2626',
  warning: '#d97706',
  success: '#16a34a',
  verseNumber: '#2563eb',
  verseText: '#262626',
  verseHighlight: '#dbeafe',
};

// Nord theme
export const nordTheme: Theme = {
  name: 'nord',
  background: '#2e3440',
  backgroundPanel: '#3b4252',
  text: '#eceff4',
  textMuted: '#d8dee9',
  textHighlight: '#ffffff',
  border: '#4c566a',
  borderFocused: '#88c0d0',
  accent: '#88c0d0',
  accentMuted: '#81a1c1',
  error: '#bf616a',
  warning: '#ebcb8b',
  success: '#a3be8c',
  verseNumber: '#81a1c1',
  verseText: '#e5e9f0',
  verseHighlight: '#434c5e',
};

// Dracula theme
export const draculaTheme: Theme = {
  name: 'dracula',
  background: '#282a36',
  backgroundPanel: '#343746',
  text: '#f8f8f2',
  textMuted: '#6272a4',
  textHighlight: '#ffffff',
  border: '#44475a',
  borderFocused: '#bd93f9',
  accent: '#bd93f9',
  accentMuted: '#ff79c6',
  error: '#ff5555',
  warning: '#f1fa8c',
  success: '#50fa7b',
  verseNumber: '#8be9fd',
  verseText: '#f8f8f2',
  verseHighlight: '#44475a',
};

// Catppuccin Mocha theme
export const catppuccinTheme: Theme = {
  name: 'catppuccin',
  background: '#1e1e2e',
  backgroundPanel: '#313244',
  text: '#cdd6f4',
  textMuted: '#6c7086',
  textHighlight: '#ffffff',
  border: '#45475a',
  borderFocused: '#cba6f7',
  accent: '#cba6f7',
  accentMuted: '#f5c2e7',
  error: '#f38ba8',
  warning: '#fab387',
  success: '#a6e3a1',
  verseNumber: '#89b4fa',
  verseText: '#cdd6f4',
  verseHighlight: '#45475a',
};

// Gruvbox Dark theme
export const gruvboxTheme: Theme = {
  name: 'gruvbox',
  background: '#282828',
  backgroundPanel: '#3c3836',
  text: '#ebdbb2',
  textMuted: '#928374',
  textHighlight: '#fbf1c7',
  border: '#504945',
  borderFocused: '#fabd2f',
  accent: '#fabd2f',
  accentMuted: '#fe8019',
  error: '#fb4934',
  warning: '#fabd2f',
  success: '#b8bb26',
  verseNumber: '#83a598',
  verseText: '#ebdbb2',
  verseHighlight: '#504945',
};

// Solarized Dark theme
export const solarizedTheme: Theme = {
  name: 'solarized',
  background: '#002b36',
  backgroundPanel: '#073642',
  text: '#839496',
  textMuted: '#586e75',
  textHighlight: '#fdf6e3',
  border: '#073642',
  borderFocused: '#268bd2',
  accent: '#268bd2',
  accentMuted: '#2aa198',
  error: '#dc322f',
  warning: '#b58900',
  success: '#859900',
  verseNumber: '#2aa198',
  verseText: '#93a1a1',
  verseHighlight: '#073642',
};

// Tokyo Night theme
export const tokyoNightTheme: Theme = {
  name: 'tokyonight',
  background: '#1a1b26',
  backgroundPanel: '#24283b',
  text: '#c0caf5',
  textMuted: '#565f89',
  textHighlight: '#ffffff',
  border: '#292e42',
  borderFocused: '#7aa2f7',
  accent: '#7aa2f7',
  accentMuted: '#bb9af7',
  error: '#f7768e',
  warning: '#e0af68',
  success: '#9ece6a',
  verseNumber: '#7dcfff',
  verseText: '#a9b1d6',
  verseHighlight: '#292e42',
};

// Rose Pine theme
export const rosePineTheme: Theme = {
  name: 'rosepine',
  background: '#191724',
  backgroundPanel: '#1f1d2e',
  text: '#e0def4',
  textMuted: '#6e6a86',
  textHighlight: '#ffffff',
  border: '#26233a',
  borderFocused: '#c4a7e7',
  accent: '#c4a7e7',
  accentMuted: '#ebbcba',
  error: '#eb6f92',
  warning: '#f6c177',
  success: '#9ccfd8',
  verseNumber: '#31748f',
  verseText: '#e0def4',
  verseHighlight: '#26233a',
};

// Sepia theme (reading-friendly)
export const sepiaTheme: Theme = {
  name: 'sepia',
  background: '#f4ecd8',
  backgroundPanel: '#ebe3d0',
  text: '#5b4636',
  textMuted: '#8b7355',
  textHighlight: '#3d2914',
  border: '#d4c4a8',
  borderFocused: '#8b4513',
  accent: '#8b4513',
  accentMuted: '#a0522d',
  error: '#b22222',
  warning: '#cd853f',
  success: '#228b22',
  verseNumber: '#6b4423',
  verseText: '#5b4636',
  verseHighlight: '#e6dcc6',
};

// All themes registry (without system - it's virtual)
export const themes: Record<string, Theme> = {
  dark: darkTheme,
  light: lightTheme,
  nord: nordTheme,
  dracula: draculaTheme,
  catppuccin: catppuccinTheme,
  gruvbox: gruvboxTheme,
  solarized: solarizedTheme,
  tokyonight: tokyoNightTheme,
  rosepine: rosePineTheme,
  sepia: sepiaTheme,
};

// Cached detected system theme
let cachedSystemTheme: 'dark' | 'light' | null = null;

// Query terminal background color using OSC escape sequences
async function queryTerminalBackground(): Promise<'dark' | 'light' | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return null;

  return new Promise((resolve) => {
    let timeout: NodeJS.Timeout;
    let wasRawMode = process.stdin.isRaw;

    const cleanup = () => {
      clearTimeout(timeout);
      process.stdin.removeListener('data', handler);
      if (!wasRawMode && process.stdin.setRawMode) {
        try {
          process.stdin.setRawMode(false);
        } catch {
          // Ignore errors when restoring raw mode
        }
      }
    };

    const handler = (data: Buffer) => {
      const str = data.toString();
      // Match OSC 11 (background color) response: \x1b]11;rgb:RRRR/GGGG/BBBB\x07
      // eslint-disable-next-line no-control-regex -- Terminal escape sequences require control characters
      const bgMatch = str.match(/\x1b\]11;(?:rgb:)?([^\x07\x1b]+)/);
      if (bgMatch) {
        const colorStr = bgMatch[1];
        let r = 0,
          g = 0,
          b = 0;

        if (colorStr?.startsWith('rgb:') || colorStr?.includes('/')) {
          // Format: rgb:RRRR/GGGG/BBBB (16-bit) or RRRR/GGGG/BBBB
          const parts = colorStr.replace('rgb:', '').split('/');
          if (parts.length >= 3) {
            r = parseInt(parts[0] ?? '0', 16) >> 8;
            g = parseInt(parts[1] ?? '0', 16) >> 8;
            b = parseInt(parts[2] ?? '0', 16) >> 8;
          }
        } else if (colorStr?.startsWith('#')) {
          // Format: #RRGGBB
          const hex = colorStr.slice(1);
          r = parseInt(hex.slice(0, 2), 16);
          g = parseInt(hex.slice(2, 4), 16);
          b = parseInt(hex.slice(4, 6), 16);
        }

        // Calculate luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        cleanup();
        resolve(luminance > 0.5 ? 'light' : 'dark');
      }
    };

    try {
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
      }
      process.stdin.on('data', handler);

      // Query background (OSC 11)
      process.stdout.write('\x1b]11;?\x07');

      // Timeout after 100ms - don't block for too long
      timeout = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 100);
    } catch {
      resolve(null);
    }
  });
}

// Detect system theme using terminal query or fallback heuristics
export function detectSystemTheme(): 'dark' | 'light' {
  if (cachedSystemTheme) return cachedSystemTheme;

  // Check COLORFGBG environment variable (set by some terminals)
  const colorFgBg = process.env['COLORFGBG'];
  if (colorFgBg) {
    const parts = colorFgBg.split(';');
    const bg = parseInt(parts[parts.length - 1] ?? '', 10);
    if (!isNaN(bg)) {
      cachedSystemTheme = bg < 7 ? 'dark' : 'light';
      return cachedSystemTheme;
    }
  }

  // Default to dark
  cachedSystemTheme = 'dark';
  return cachedSystemTheme;
}

// Async version that queries terminal - use this when possible
export async function detectSystemThemeAsync(): Promise<'dark' | 'light'> {
  if (cachedSystemTheme) return cachedSystemTheme;

  // Try querying the terminal first
  const detected = await queryTerminalBackground();
  if (detected) {
    cachedSystemTheme = detected;
    return detected;
  }

  // Fallback to sync detection
  return detectSystemTheme();
}

// Get resolved theme (handles 'system' by detecting)
export function getResolvedThemeName(name: string): string {
  if (name === 'system') {
    return detectSystemTheme();
  }
  return name;
}

// Get theme by name (defaults to dark, handles 'system')
export function getTheme(name: string): Theme {
  const resolvedName = getResolvedThemeName(name);
  return themes[resolvedName] ?? darkTheme;
}

// Get all theme names (includes 'system' at the start)
export function getThemeNames(): string[] {
  return ['system', ...Object.keys(themes)];
}
