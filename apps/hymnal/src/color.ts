/**
 * The web's colours: CSS custom properties that follow the page's colour
 * scheme (`light-dark()`), which the appearance setting sets. The root
 * layout writes `webColors`; the values are Apple's system colours.
 */

import type { ColorValue } from 'react-native';

import { accent } from './theme';

export const color = {
  label: 'var(--label)',
  secondaryLabel: 'var(--secondary-label)',
  background: 'var(--background)',
  separator: 'var(--separator)',
  grouped: 'var(--grouped)',
} satisfies Record<string, ColorValue>;

/** The accent in the scheme showing now. */
export const useAccent = (): ColorValue => 'var(--accent)';

export const webColors = `
:root {
  color-scheme: light dark;
  --accent: light-dark(${accent.light}, ${accent.dark});
  --label: light-dark(#000000, #ffffff);
  --secondary-label: light-dark(rgb(60 60 67 / 0.6), rgb(235 235 245 / 0.6));
  --background: light-dark(#ffffff, #000000);
  --separator: light-dark(rgb(60 60 67 / 0.29), rgb(84 84 88 / 0.6));
  --grouped: light-dark(#f2f2f7, #1c1c1e);
}
html, body { margin: 0; background: var(--background); color: var(--label); }
body { display: flex; flex-direction: column; height: 100dvh; font-family: system-ui, -apple-system, sans-serif; }
`;
