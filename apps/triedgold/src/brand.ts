/**
 * The Tried Gold brand: the Sanctuary Blue palette (the owner's pick,
 * 2026-09-30) and its type, in the one place both the site and the films'
 * title and credits cards read it from (`@bible/triedgold/brand`).
 *
 * The swatches are the palette. A scheme assigns them roles for one ground,
 * light or dark; the site paints with the roles, never with a swatch. The two
 * darkened golds exist only for text: the gilt swatch on linen measures
 * 2.2:1, so gold type on the light ground uses `accent` (4.4:1, large text
 * and headings), and marks use `gold`. Contrast figures are WCAG 2.x, from
 * the palette study (SP/triedgold/palettes/palettes.md).
 *
 * No red anywhere: in the films scarlet means sin.
 */

/** The palette's colours, by name. */
export const swatches = {
  /** The deep blue the ministry already used (#0a3254 on the old site). */
  sanctuary: '#0a3254',
  lapis: '#1f5582',
  linen: '#f6f0e1',
  gilt: '#c9a14a',
  slate: '#5b6b7a',
  mist: '#dfe6ec',
} as const;

/** The roles a page paints with. */
export interface Scheme {
  /** The page. */
  readonly ground: string;
  /** Cards and panels on the ground. */
  readonly surface: string;
  /** Body text and headings. */
  readonly ink: string;
  /** Secondary text: dates, captions, the footer. */
  readonly muted: string;
  /** Gold for text: links on hover, eyebrows, large headings. */
  readonly accent: string;
  /** Gold for marks and fills: the logo, rules, a button's arrow. */
  readonly gold: string;
  /** Hairlines and borders. */
  readonly rule: string;
}

/**
 * Light: ink on linen 11.6:1, muted 4.8:1, accent 4.4:1 (large text only).
 * Dark: ink on sanctuary 11.6:1, muted 7.3:1, accent 7.2:1.
 */
export const schemes = {
  light: {
    ground: swatches.linen,
    surface: '#ece3cd',
    ink: swatches.sanctuary,
    muted: swatches.slate,
    accent: '#8c6a1f',
    gold: swatches.gilt,
    rule: '#dcd2bb',
  },
  dark: {
    ground: swatches.sanctuary,
    surface: swatches.lapis,
    ink: swatches.linen,
    muted: '#b4c3d1',
    accent: '#e0bc68',
    gold: '#e0bc68',
    rule: swatches.lapis,
  },
} as const satisfies Record<'light' | 'dark', Scheme>;

/** The type: a Garamond for display, a humanist sans for text. */
export const fonts = {
  display: 'Cormorant Garamond',
  body: 'Source Sans 3',
  /** Google Fonts stylesheet carrying both faces at the weights the brand uses. */
  stylesheet:
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Source+Sans+3:wght@400;600&display=swap',
} as const;

const variables = (scheme: Scheme): string =>
  Object.entries(scheme)
    .map(([role, value]) => `--tg-${role}:${value};`)
    .join('');

/**
 * The schemes as CSS custom properties (`--tg-ground`, `--tg-ink`, …): light
 * by default, dark when the reader's system asks for it.
 */
export const brandCss = `:root{color-scheme:light dark;${variables(schemes.light)}}@media (prefers-color-scheme: dark){:root{${variables(schemes.dark)}}}`;
