/**
 * How a hymn page is set: the words' size in steps, their font, the space
 * between lines, and whether the screen stays on while a hymn is shown. The
 * reader picks them in the "Aa" sheet; each is a `reading.*` setting
 * (`src/settings.ts`).
 *
 * The default step and spacing set the page as it has always been: words of
 * 17 pt on lines of 24 pt, chords of 15 pt on rows of 20 pt. Every size
 * scales by the same factor, and the system's text size (Dynamic Type)
 * still multiplies the result where the platform applies it to text.
 */

import { Schema } from 'effect';

/** The words' sizes, in points, one per step. */
export const SIZES = [14, 15, 17, 19, 21, 24, 28, 32] as const;

/** The step the page starts at: 17 pt. */
export const DEFAULT_SIZE = 2;

/** A step of `SIZES`: a stored step outside them does not decode, so its setting falls back to the default. */
export const Size = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: SIZES.length - 1 }));
export type Size = typeof Size.Type;

export const Font = Schema.Literals(['system', 'serif']);
export type Font = typeof Font.Type;

export const Spacing = Schema.Literals(['compact', 'normal', 'roomy']);
export type Spacing = typeof Spacing.Type;

/** The reading settings as one value. */
export interface Reading {
  readonly size: Size;
  readonly font: Font;
  readonly spacing: Spacing;
}

export const defaultReading: Reading = { size: DEFAULT_SIZE, font: 'system', spacing: 'normal' };

/** The step one larger, held at the largest. */
export const larger = (size: Size): Size => Math.min(size + 1, SIZES.length - 1);

/** The step one smaller, held at the smallest. */
export const smaller = (size: Size): Size => Math.max(size - 1, 0);

/** The words' size at a step, in points. */
export const pointsAt = (size: Size): number => SIZES[size] ?? SIZES[DEFAULT_SIZE];

/** Each spacing's line height, as a multiple of the words' size: normal is 24 over 17. */
const LEADING: Record<Spacing, number> = { compact: 21 / 17, normal: 24 / 17, roomy: 29 / 17 };

/** The hanging indent of a wrapped line, as a multiple of the words' size. */
const INDENT = 1.25;

/** What a hymn page's text is set in. Sizes are in points before the system's text size. */
export interface ReadingStyle {
  readonly words: { readonly fontSize: number; readonly lineHeight: number };
  readonly chords: { readonly fontSize: number; readonly lineHeight: number };
  readonly font: Font;
  /**
   * How far a wrapped line's later rows sit right of its first, in points on
   * screen: the system's text size included, since a layout gap is not scaled
   * by it.
   */
  readonly indent: number;
}

/** The page's text for `reading`, under the system's text size `fontScale`. */
export const readingStyle = (reading: Reading, fontScale: number): ReadingStyle => {
  const size = pointsAt(reading.size);
  const factor = size / SIZES[DEFAULT_SIZE];
  return {
    words: { fontSize: size, lineHeight: Math.round(size * LEADING[reading.spacing]) },
    chords: { fontSize: Math.round(15 * factor), lineHeight: Math.round(20 * factor) },
    font: reading.font,
    indent: Math.round(size * INDENT * fontScale),
  };
};
