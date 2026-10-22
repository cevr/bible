/**
 * The reading settings' schema and the page's text style they give.
 */

import { describe, expect, it } from 'bun:test';
import { Schema } from 'effect';

import {
  DEFAULT_SIZE,
  defaultReading,
  Font,
  larger,
  readingStyle,
  SIZES,
  Size,
  smaller,
  Spacing,
} from './reading';

describe('the reading settings', () => {
  it('start as the page has always been set: 17 pt words on 24 pt lines, 15 pt chords on 20 pt rows', () => {
    expect(defaultReading).toEqual({ size: DEFAULT_SIZE, font: 'system', spacing: 'normal' });
    expect(readingStyle(defaultReading, 1)).toEqual({
      words: { fontSize: 17, lineHeight: 24 },
      chords: { fontSize: 15, lineHeight: 20 },
      font: 'system',
      indent: 21,
    });
  });

  it('step the size within its ends', () => {
    expect(larger(DEFAULT_SIZE)).toBe(DEFAULT_SIZE + 1);
    expect(smaller(DEFAULT_SIZE)).toBe(DEFAULT_SIZE - 1);
    expect(smaller(0)).toBe(0);
    expect(larger(SIZES.length - 1)).toBe(SIZES.length - 1);
  });

  it('decode only the steps, fonts and spacings there are', () => {
    const size = Schema.decodeUnknownOption(Size);
    expect(size(0)._tag).toBe('Some');
    expect(size(SIZES.length - 1)._tag).toBe('Some');
    expect(size(SIZES.length)._tag).toBe('None');
    expect(size(-1)._tag).toBe('None');
    expect(size(2.5)._tag).toBe('None');
    expect(Schema.decodeOption(Font)('serif')._tag).toBe('Some');
    expect(Schema.decodeUnknownOption(Font)('mono')._tag).toBe('None');
    expect(Schema.decodeOption(Spacing)('roomy')._tag).toBe('Some');
    expect(Schema.decodeUnknownOption(Spacing)('loose')._tag).toBe('None');
  });

  it('scale the chord rows by the words’ factor, and space lines by the spacing', () => {
    const largest = readingStyle({ size: SIZES.length - 1, font: 'serif', spacing: 'roomy' }, 1);
    expect(largest.words.fontSize).toBe(32);
    expect(largest.chords).toEqual({ fontSize: Math.round((15 * 32) / 17), lineHeight: 38 });
    expect(largest.words.lineHeight).toBeGreaterThan(Math.round((32 * 24) / 17));
    expect(largest.font).toBe('serif');
    const compact = readingStyle({ ...defaultReading, spacing: 'compact' }, 1);
    expect(compact.words.lineHeight).toBeLessThan(24);
  });

  it("widen the hanging indent with the system's text size", () => {
    // Each indent is rounded to whole points, so twice the size lands within a point of twice the indent.
    const twice =
      readingStyle(defaultReading, 2).indent - 2 * readingStyle(defaultReading, 1).indent;
    expect(Math.abs(twice)).toBeLessThanOrEqual(1);
  });
});
