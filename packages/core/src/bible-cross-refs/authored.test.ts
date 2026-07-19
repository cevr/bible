import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';

import { Reference } from '../bible/model.js';
import {
  AddPersonalCrossReference,
  CatalogClassificationOverride,
  CatalogClassificationSuggestion,
} from './authored.js';

describe('authored cross-reference contracts', () => {
  test('keeps personal references structurally distinct from catalog relationships', () => {
    const command = Schema.decodeUnknownSync(AddPersonalCrossReference)({
      _tag: 'AddPersonalCrossReference',
      id: 'personal-1',
      source: Reference.verse(1, 1, 1),
      target: Reference.verse(43, 1, 1),
      note: Option.some('The promise and its fulfillment'),
      classification: Option.some('typological'),
    });

    expect(command._tag).toBe('AddPersonalCrossReference');
  });

  test('makes suggestions and reader overrides impossible to confuse', () => {
    const suggestion = Schema.decodeUnknownSync(CatalogClassificationSuggestion)({
      catalogReferenceId: 'catalog-1',
      classification: 'allusion',
      confidence: 0.8,
      classifierVersion: 'schema-1',
      modelVersion: 'model-1',
    });
    const override = Schema.decodeUnknownSync(CatalogClassificationOverride)({
      catalogReferenceId: 'catalog-1',
      classification: 'quotation',
    });

    expect('confidence' in suggestion).toBe(true);
    expect('confidence' in override).toBe(false);
  });
});
