// The credits give each source once: a work cited in several beats is one
// entry with its places merged, and no locator is left on a line alone.

import { describe, expect, test } from 'bun:test';
import { type Author, creditRoll } from './credits.ts';

const AUTHORS: ReadonlyArray<Author> = [
  { name: 'Ellen G. White' },
  { name: 'E. J. Waggoner' },
  { name: 'A. T. Jones' },
];

const items = (cites: ReadonlyArray<string>) =>
  creditRoll('T', cites, AUTHORS)
    .filter((c) => c.kind === 'item')
    .map((c) => c.text);

describe('creditRoll', () => {
  test('merge a work cited in several beats into one entry, pages in order', () => {
    expect(
      items([
        'Ellen G. White, Steps to Christ, 70',
        'Ellen G. White, Letter 57, 1895 (TM 91–92)',
        'Ellen G. White, Steps to Christ, 18',
        'Ellen G. White, Letter 57, 1895 (TM 92)',
        'Ellen G. White, Steps to Christ, 17',
        'Ellen G. White, Steps to Christ, 47, 70',
        'Ellen G. White, Letter 57, 1895 (TM 91)',
        'A. T. Jones, Lessons on Faith, 16',
        'A. T. Jones, Lessons on Faith, 14–15',
      ]),
    ).toEqual([
      'Steps to Christ, 17, 18, 47, 70',
      'Letter 57, 1895 (TM 91–92)',
      'Lessons on Faith, 14–15, 16',
    ]);
  });

  test("give a periodical's issues under its title once, by date", () => {
    expect(
      items([
        'E. J. Waggoner, The Present Truth, October 18, 1894, 659',
        'E. J. Waggoner, The Present Truth, May 9, 1895, 290',
        'E. J. Waggoner, The Present Truth, March 21, 1895, 177',
      ]).join(' '),
    ).toBe('The Present Truth, October 18, 1894, 659; March 21, 1895, 177; May 9, 1895, 290');
  });
});
