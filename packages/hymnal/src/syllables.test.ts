import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Syllables from './syllables.js';

const cuts = (words: string) =>
  words.split(' ').map((word) => {
    const [count = 1] = Syllables.counts(word);
    return Syllables.split(word, count).join('-');
  });

describe('Syllables.counts', () => {
  it.effect('counts as sung, the likeliest first', () =>
    Effect.sync(() => {
      expect(Syllables.counts('Almighty,')).toEqual([3]);
      expect(Syllables.counts('Hallelujah!')).toEqual([4]);
      // A singer runs these vowels together.
      expect(Syllables.counts('fire')).toEqual([2, 1]);
      expect(Syllables.counts('our')).toEqual([2, 1]);
      expect(Syllables.counts('glorious')).toEqual([3, 2]);
      expect(Syllables.counts('every')).toEqual([3, 2]);
      // "us(2)" in the dictionary is U.S.: a variant with more syllables is never sung.
      expect(Syllables.counts('us')).toEqual([1]);
      expect(Syllables.counts('blessed')).toEqual([1, 2]);
      expect(Syllables.counts('—')).toEqual([]);
    }),
  );

  it.effect("counts the hymnal's elisions, archaic endings and compounds", () =>
    Effect.sync(() => {
      expect(
        ["o'er", 'e’er', "whate'er", "heav'n", "heav'nly", "vict'ry", "thro'"].map((w) =>
          Syllables.counts(w),
        ),
      ).toEqual([[1], [1], [2], [1], [2], [2], [1]]);
      expect(
        ['reigneth', 'abideth', 'didst', 'Redeemer', 'forevermore', 'Saviour'].map(
          (w) => Syllables.counts(w)[0],
        ),
      ).toEqual([2, 3, 1, 3, 4, 2]);
    }),
  );
});

describe('Syllables.split', () => {
  it.effect('cuts words as a hymnal prints them', () =>
    Effect.sync(() => {
      expect(cuts('Praise to the Lord, the Almighty, the King of creation!')).toEqual([
        'Praise',
        'to',
        'the',
        'Lord,',
        'the',
        'Al-might-y,',
        'the',
        'King',
        'of',
        'cre-a-tion!',
      ]);
      expect(cuts('wondrously reigneth sustaineth singing Redeemer faithfulness')).toEqual([
        'won-drous-ly',
        'reign-eth',
        'sus-tain-eth',
        'sing-ing',
        'Re-deem-er',
        'faith-ful-ness',
      ]);
      expect(cuts('Father mother every forevermore holy honor angel Alleluia')).toEqual([
        'Fa-ther',
        'moth-er',
        'ev-er-y',
        'for-ev-er-more',
        'ho-ly',
        'hon-or',
        'an-gel',
        'Al-le-lu-ia',
      ]);
      expect(cuts('around water sustain master')).toEqual([
        'a-round',
        'wa-ter',
        'sus-tain',
        'mas-ter',
      ]);
      // An R-coloured o opens inside a word; -est on a stem that is only a name is no ending;
      // a plural -es keeps the cluster before it.
      expect(cuts('adoration victory harvest courses changes')).toEqual([
        'ad-o-ra-tion',
        'vic-to-ry',
        'har-vest',
        'cours-es',
        'chang-es',
      ]);
      expect(cuts("heav'nly vict'ry whate'er th'eternal")).toEqual([
        "heav'n-ly",
        "vic-t'ry",
        "what-e'er",
        "th'e-ter-nal",
      ]);
    }),
  );

  it.effect(
    'cuts into fewer pieces as a word is sung shorter, and holds a word it cannot cut',
    () =>
      Effect.sync(() => {
        expect(Syllables.split('glorious', 2)).toEqual(['glo', 'rious']);
        expect(Syllables.split('every', 2)).toEqual(['ev', 'ery']);
        expect(Syllables.split('"Holy,', 2)).toEqual(['"Ho', 'ly,']);
        expect(Syllables.split('fire', 2)).toEqual(['fire']);
        expect(Syllables.split('blessed', 2)).toEqual(['bless', 'ed']);
      }),
  );
});

describe('Syllables.stresses', () => {
  it.effect('marks stressed syllables from the dictionary, a stem, or a weak word', () =>
    Effect.sync(() => {
      expect(Syllables.stresses('afar,', 2)).toEqual([false, true]);
      expect(Syllables.stresses('Alleluia!', 4)).toEqual([true, false, true, false]);
      expect(Syllables.stresses('reigneth', 2)).toEqual([true, false]);
      expect(Syllables.stresses('glorious', 3)).toEqual([true, false, false]);
      expect([Syllables.stresses('the', 1), Syllables.stresses('Lord', 1)]).toEqual([
        [false],
        [true],
      ]);
      // Sung shorter than the dictionary has it: unknown.
      expect(Syllables.stresses('glorious', 2)).toBeUndefined();
    }),
  );
});
