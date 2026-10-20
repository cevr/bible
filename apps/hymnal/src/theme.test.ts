import { describe, expect, test } from 'bun:test';

import { Match } from 'effect';

import { type Roles, theme } from './theme';

/** A hex colour's red, green and blue, parsed here apart from the theme's own mixing. */
const rgb = (hex: string) =>
  [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((pair) => Number.parseInt(pair, 16));

/** An sRGB channel (0 to 255) as linear light, 0 to 1. */
const linear = (channel: number) =>
  Match.value(channel / 255).pipe(
    Match.when(
      (c) => c <= 0.04045,
      (c) => c / 12.92,
    ),
    Match.orElse((c) => ((c + 0.055) / 1.055) ** 2.4),
  );

/** WCAG 2's relative luminance of an sRGB hex colour. */
const luminance = (hex: string) => {
  const [r = 0, g = 0, b = 0] = rgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

/** WCAG 2's contrast ratio between two colours, 1 to 21. */
const contrast = (a: string, b: string) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * Every text role on every role it is drawn on, with WCAG AA's least ratio
 * for its smallest size there: all are body sizes (13 to 17 points), so 4.5.
 */
const pairs: ReadonlyArray<readonly [text: keyof Roles, on: keyof Roles]> = [
  ['ink', 'ground'],
  ['muted', 'ground'],
  ['accent', 'ground'],
  ['ink', 'soft'],
  ['accent', 'soft'],
];

describe('the palette meets WCAG AA', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const [text, on] of pairs) {
      test(`${scheme}: ${text} on ${on} is at least 4.5:1`, () => {
        const roles = theme[scheme];
        expect(contrast(roles[text], roles[on])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

test('the contrast ratio is WCAG 2’s', () => {
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  // A colour whose channels differ: Vandar Poel's Blue on the light ground.
  expect(contrast('#064f6e', '#eee8e1')).toBeCloseTo(7.34, 2);
});

/**
 * The roles as the palette page's `theme()` draws Wada No. 167, but for light
 * muted (20% toward the ground, not 35%) and dark soft (70%, not 55%), which
 * reach AA. A change to the mixing, the palette or a channel's order shows here.
 */
test('the roles are palette A', () => {
  expect(theme).toEqual({
    light: {
      ground: '#eee8e1',
      ink: '#064f6e',
      muted: '#346e85',
      line: '#99998b',
      accent: '#064f6e',
      soft: '#bddfeb',
    },
    dark: {
      ground: '#032431',
      ink: '#e4dbce',
      muted: '#8a928f',
      line: '#304950',
      accent: '#a7d4e4',
      soft: '#345967',
    },
  });
});
