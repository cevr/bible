/**
 * The appearance setting shown on the web: the page's `color-scheme`, which
 * the theme's `light-dark()` colours follow.
 */

import type { Appearance } from './settings';

const scheme = { system: 'light dark', light: 'light', dark: 'dark' } as const satisfies Record<
  Appearance,
  string
>;

export const applyAppearance = (appearance: Appearance): void => {
  document.documentElement.style.colorScheme = scheme[appearance];
};
