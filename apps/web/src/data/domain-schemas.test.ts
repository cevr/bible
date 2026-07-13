import { describe, expect, test } from 'bun:test';
import { CatalogCrossRefSource, CrossRefType } from '@bible/core/bible-cross-refs';
import { Schema } from 'effect';

import { MarkerColor } from './annotations/types';
import { ReadingPlanType } from './plans/types';
import { DisplayMode, Theme } from './state/effect-service';

describe('persisted domain leaf schemas', () => {
  test.each([
    [MarkerColor, 'blue'],
    [CatalogCrossRefSource, 'openbible'],
    [CrossRefType, 'typological'],
    [ReadingPlanType, 'custom'],
    [Theme, 'system'],
    [DisplayMode, 'paragraph'],
  ] as const)('accepts a canonical persisted value', (schema, value) => {
    expect(Schema.decodeUnknownSync(schema)(value)).toBe(value);
  });

  test.each([
    [MarkerColor, 'pink'],
    [CatalogCrossRefSource, 'unknown-catalog'],
    [CrossRefType, 'similar'],
    [ReadingPlanType, 'shared'],
    [Theme, 'sepia'],
    [DisplayMode, 'page'],
  ] as const)('rejects a corrupt persisted value at decode', (schema, value) => {
    expect(() => Schema.decodeUnknownSync(schema)(value)).toThrow();
  });
});
