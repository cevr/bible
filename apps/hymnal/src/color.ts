/**
 * The web's colours: the theme's roles as CSS custom properties that follow
 * the page's colour scheme (`light-dark()`), which the appearance setting
 * sets. The root layout writes `webColors`.
 */

import type { ColorValue } from 'react-native';

import { type Roles, theme } from './theme';

const roles = [
  'ground',
  'ink',
  'muted',
  'line',
  'accent',
  'soft',
  'onAccent',
  'pressed',
  'onPressed',
] as const satisfies ReadonlyArray<keyof Roles>;

export const color = {
  ground: 'var(--ground)',
  ink: 'var(--ink)',
  muted: 'var(--muted)',
  line: 'var(--line)',
  soft: 'var(--soft)',
} satisfies Record<Exclude<keyof Roles, Fill>, ColorValue>;

/** The roles a screen reads through a hook: the accent fill and its text, pressed or not. */
type Fill = 'accent' | 'onAccent' | 'pressed' | 'onPressed';

/** The accent in the scheme showing now. */
export const useAccent = (): ColorValue => 'var(--accent)';

/** Text on the accent in the scheme showing now. */
export const useOnAccent = (): ColorValue => 'var(--onAccent)';

/** The accent fill while pressed, and its text, in the scheme showing now. */
export const usePressed = () => ({
  fill: 'var(--pressed)',
  text: 'var(--onPressed)',
});

export const webColors = `
:root {
  color-scheme: light dark;
${roles.map((role) => `  --${role}: light-dark(${theme.light[role]}, ${theme.dark[role]});`).join('\n')}
}
html, body { margin: 0; background: var(--ground); color: var(--ink); }
body { display: flex; flex-direction: column; height: 100dvh; font-family: system-ui, -apple-system, sans-serif; }
::selection { background: var(--soft); color: var(--ink); }
`;
