import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option } from 'effect';

import { vectorDocument } from './vector-document.js';

describe('vectorDocument', () => {
  const test = it.effect;
  const row: Parameters<typeof vectorDocument>[0] = {
    bookCode: 'PP',
    refCode: 'pp-84-4',
    paraId: Option.some('84.4'),
    refcodeShort: Option.some('PP 84.4'),
    contentText: '  The words.  ',
  };

  test('keeps a paragraph with an identity and text, trimmed', () =>
    Effect.sync(() => {
      expect(vectorDocument(row)).toEqual(
        Option.some({ bookCode: 'PP', paraId: '84.4', refcode: 'PP 84.4', text: 'The words.' }),
      );
    }));

  test('falls back to the row refcode when there is no short one', () =>
    Effect.sync(() => {
      expect(
        Option.map(vectorDocument({ ...row, refcodeShort: Option.none() }), (doc) => doc.refcode),
      ).toEqual(Option.some('pp-84-4'));
    }));

  test('leaves out a row with no para_id, no refcode or no text', () =>
    Effect.sync(() => {
      expect(vectorDocument({ ...row, paraId: Option.some('') })).toEqual(Option.none());
      expect(vectorDocument({ ...row, refcodeShort: Option.none(), refCode: '' })).toEqual(
        Option.none(),
      );
      expect(vectorDocument({ ...row, contentText: '   ' })).toEqual(Option.none());
    }));
});
