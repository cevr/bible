import { describe, expect, test } from 'effect-bun-test';

import { backMatterClassifier, isBackMatterTitle } from './back-matter.js';

describe('back-matter titles', () => {
  test('names the apparatus the corpus titles as such', () => {
    for (const title of [
      'Appendix',
      'Appendix A: Unauthenticated Visions Attributed to Ellen G. White',
      'Appendix—Solemn Warnings Repeated',
      'Appendixes',
      'Table of Contents',
      'Contents.',
      'General Index',
      'Index of Scriptures Quoted',
      'EGW Scripture Index Vol. 1-4',
      'Nave’s Topical Index',
      'Bibliography of Works Cited',
      'Selected Bibliography',
      'List of Correspondents',
      'List of Illustrations.',
      'Glossary',
    ]) {
      expect([title, isBackMatterTitle(title)]).toEqual([title, true]);
    }
  });

  test('leaves real titles that share a word with the apparatus', () => {
    for (const title of [
      'Words Are an Index, September 27',
      'Notes of Travel',
      'The Latter Rain',
      'Contents of the Ark',
      'Appendicitis and Its Treatment',
    ]) {
      expect([title, isBackMatterTitle(title)]).toEqual([title, false]);
    }
  });
});

describe('back-matter placement', () => {
  const heading = (publicationId: number, puborder: number, level: number, title: string) => ({
    publicationId,
    puborder,
    level,
    title,
  });
  /** `1EGWLM`'s shape: a front list, body letters as `h4` with no part heading
   *  above them, then a tail of appendix, bibliography and an index whose
   *  letter dividers are `h4`. */
  const outline = [
    heading(1, 1, 1, 'Letters and Manuscripts'),
    heading(1, 10, 3, 'List of Illustrations'),
    heading(1, 50, 3, 'Biographical Sketches'),
    heading(1, 70, 3, 'Appendix A'),
    heading(1, 80, 3, 'Bibliography'),
    heading(1, 90, 3, 'List of Correspondents'),
    // A second book: an appendix mid-book, then a chapter after it.
    heading(2, 1, 2, 'Appendix'),
    heading(2, 20, 2, 'The Loud Cry'),
  ];
  /** Each position's closest heading of any level, as the corpus answers. */
  const nearest = [
    { publicationId: 1, puborder: 12, heading: heading(1, 10, 3, 'List of Illustrations') },
    { publicationId: 1, puborder: 31, heading: heading(1, 30, 4, 'Lt 1, 1845') },
    { publicationId: 1, puborder: 55, heading: heading(1, 50, 3, 'Biographical Sketches') },
    { publicationId: 1, puborder: 75, heading: heading(1, 72, 4, 'Note 3') },
    { publicationId: 1, puborder: 95, heading: heading(1, 93, 4, 'L') },
    { publicationId: 2, puborder: 5, heading: heading(2, 1, 2, 'Appendix') },
    { publicationId: 2, puborder: 12, heading: heading(2, 10, 4, 'Note 1') },
    { publicationId: 2, puborder: 25, heading: heading(2, 20, 2, 'The Loud Cry') },
  ];
  const isBackMatter = backMatterClassifier(outline, nearest);

  test('a front list covers its own lines, not the letters after it', () => {
    expect(isBackMatter(1, 12)).toBe(true);
    expect(isBackMatter(1, 31)).toBe(false);
    expect(isBackMatter(1, 55)).toBe(false);
  });

  test('the tail covers everything under it, whatever divides it', () => {
    expect(isBackMatter(1, 75)).toBe(true);
    expect(isBackMatter(1, 95)).toBe(true);
  });

  test('back matter mid-book covers its lines until a deeper heading', () => {
    expect(isBackMatter(2, 5)).toBe(true);
    expect(isBackMatter(2, 12)).toBe(false);
    expect(isBackMatter(2, 25)).toBe(false);
  });

  test('a position with no heading above it, or of an unknown book, is not', () => {
    expect(isBackMatter(1, 0)).toBe(false);
    expect(isBackMatter(3, 100)).toBe(false);
  });
});
