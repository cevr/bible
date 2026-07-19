import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';

import {
  DEFAULT_READING_PREFERENCES,
  ReadingPreferences,
  ReadingPreferencesPatch,
  applyReadingPreferencesPatch,
} from './model.js';

describe('ReadingPreferences', () => {
  test('defines the shared total reading projection', () => {
    expect(DEFAULT_READING_PREFERENCES).toEqual(
      new ReadingPreferences({
        colorMode: 'system',
        readerTypeface: 'crimson-pro',
        fontSizePx: 18,
        lineHeightRatio: 1.8,
        letterSpacingEm: 0,
        measureCh: 68,
        bibleLayout: 'verse',
        showStrongs: true,
        showMarginNotes: true,
        showCrossReferences: true,
      }),
    );
  });

  test('accepts absolute partial updates and rejects empty or invalid patches', () => {
    const decode = Schema.decodeUnknownSync(ReadingPreferencesPatch);

    expect(decode({ colorMode: 'sepia', showStrongs: false })).toEqual({
      colorMode: 'sepia',
      showStrongs: false,
    });
    expect(() => decode({})).toThrow();
    expect(() => decode({ fontSizePx: 33 })).toThrow();
    expect(() => decode({ readerTypeface: 'url(javascript:bad)' })).toThrow();
  });

  test('projects an absolute patch over the current total value', () => {
    const updated = applyReadingPreferencesPatch(DEFAULT_READING_PREFERENCES, {
      colorMode: 'dark',
      fontSizePx: 22,
    });

    expect(updated.colorMode).toBe('dark');
    expect(updated.fontSizePx).toBe(22);
    expect(updated.lineHeightRatio).toBe(DEFAULT_READING_PREFERENCES.lineHeightRatio);
  });
});
