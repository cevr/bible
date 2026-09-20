import { describe, expect, it } from 'effect-bun-test';
import { Effect, Schema } from 'effect';

import {
  BookSubtype,
  BookType,
  CorpusSection,
  EXCLUDED_SUBTYPES,
  isUnfiltered,
  NO_FILTER,
  NO_SELECTION,
  SELECTABLE_SUBTYPES,
  SignedFromStrings,
} from './corpus-class.js';

const decodeSubtype = Schema.decodeUnknownSync(SignedFromStrings(BookSubtype));
const encodeSubtype = Schema.encodeUnknownSync(SignedFromStrings(BookSubtype));

describe('SignedFromStrings', () => {
  const test = it.effect;

  test('splits bare values into include and prefixed ones into exclude', () =>
    Effect.sync(() => {
      expect(decodeSubtype(['commentary', '-devotional'])).toEqual({
        include: ['commentary'],
        exclude: ['devotional'],
      });
    }));

  test('reads an all-negative selection, which is the "no devotionals" case', () =>
    Effect.sync(() => {
      expect(decodeSubtype(['-devotional'])).toEqual({ include: [], exclude: ['devotional'] });
    }));

  /** A search link is pasted, truncated and hand-edited. The useful answer to
   *  a value nobody recognises is the reader's results with one filter
   *  missing, not a failed request. */
  test('drops unrecognised values rather than failing', () =>
    Effect.sync(() => {
      expect(decodeSubtype(['devotionl', 'commentary', '-nonsense'])).toEqual({
        include: ['commentary'],
        exclude: [],
      });
    }));

  test('drops a lone prefix and a prefixed unknown alike', () =>
    Effect.sync(() => {
      expect(decodeSubtype(['-', '-devotionl'])).toEqual(NO_SELECTION);
    }));

  test('reads an empty list as no selection', () =>
    Effect.sync(() => {
      expect(decodeSubtype([])).toEqual(NO_SELECTION);
    }));

  /** The property that makes a produced link a readable link. */
  test('round-trips: decode ∘ encode is identity on a signed selection', () =>
    Effect.sync(() => {
      const selection = { include: ['commentary'], exclude: ['devotional'] } as const;
      expect(decodeSubtype(encodeSubtype(selection))).toEqual(selection);
    }));

  test('encodes the exclude side with the prefix and the include side without', () =>
    Effect.sync(() => {
      expect(encodeSubtype({ include: ['LtMs'], exclude: ['devotional', 'commentary'] })).toEqual([
        'LtMs',
        '-devotional',
        '-commentary',
      ]);
    }));

  test('works over the other two axes with the same spelling', () =>
    Effect.sync(() => {
      expect(Schema.decodeUnknownSync(SignedFromStrings(CorpusSection))(['-bible'])).toEqual({
        include: [],
        exclude: ['bible'],
      });
      expect(
        Schema.decodeUnknownSync(SignedFromStrings(BookType))(['book', '-dictionary']),
      ).toEqual({ include: ['book'], exclude: ['dictionary'] });
    }));
});

describe('isUnfiltered', () => {
  const test = it.effect;

  test('is true for the empty filter', () =>
    Effect.sync(() => {
      expect(isUnfiltered(NO_FILTER)).toBe(true);
    }));

  /** The regression this guards: an exclusion is a filter. An `isUnfiltered`
   *  that only looked at the include lists would report "nothing to narrow"
   *  for "no devotionals" and skip the join that implements it. */
  test('is false when an axis carries only an exclusion', () =>
    Effect.sync(() => {
      expect(
        isUnfiltered({ ...NO_FILTER, subtype: { include: [], exclude: ['devotional'] } }),
      ).toBe(false);
    }));

  test('is false when an axis carries only an inclusion', () =>
    Effect.sync(() => {
      expect(isUnfiltered({ ...NO_FILTER, section: { include: ['bible'], exclude: [] } })).toBe(
        false,
      );
    }));

  test('is false for the apparatus toggle alone', () =>
    Effect.sync(() => {
      expect(isUnfiltered({ ...NO_FILTER, excludeApparatus: true })).toBe(false);
    }));
});

describe('SELECTABLE_SUBTYPES', () => {
  const test = it.effect;

  /** `ModernEnglish` is a corpus-level rule, not a choice — a chip offering it
   *  would let a reader switch the paraphrase back on. See `EXCLUDED_SUBTYPES`. */
  test('offers every subtype except the excluded ones', () =>
    Effect.sync(() => {
      for (const excluded of EXCLUDED_SUBTYPES) {
        expect(SELECTABLE_SUBTYPES).not.toContain(excluded);
      }
      expect(SELECTABLE_SUBTYPES).toContain('devotional');
      expect(SELECTABLE_SUBTYPES).toContain('commentary');
    }));
});
