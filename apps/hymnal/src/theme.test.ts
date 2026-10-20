import { describe, expect, test } from 'bun:test';

import { Match } from 'effect';

import { type Roles, rgb, theme } from './theme';

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
  const [r, g, b] = rgb(hex);
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
});
