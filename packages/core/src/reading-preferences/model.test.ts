import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';

import {
  DEFAULT_READING_PREFERENCES,
  ReadingPreferences,
  ReadingPreferencesPatch,
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
});
