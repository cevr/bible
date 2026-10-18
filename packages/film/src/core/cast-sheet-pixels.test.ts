// A paper's colour in the words a retry's prompt says it in, beside its hex:
// the house's papers by their plain names, a light red as pink, a dark warm
// as brown.

import { describe, expect, test } from 'bun:test';
import { colourWords, hexOf, type Rgb } from './cast-sheet-pixels.ts';

describe('a paper in words', () => {
  test('names the robe, the sash and its shade as a painter would', () => {
    const papers: ReadonlyArray<Rgb> = [
      [249, 235, 219],
      [232, 181, 108],
      [221, 202, 215],
      [229, 206, 209],
      [107, 74, 46],
      [60, 78, 150],
    ];
    expect(papers.map((p) => `${colourWords(p)} ${hexOf(p)}`)).toEqual([
      'cream #f9ebdb',
      'gold #e8b56c',
      'pale lilac #ddcad7',
      'pale pink #e5ced1',
      'brown #6b4a2e',
      'blue #3c4e96',
    ]);
  });
});
