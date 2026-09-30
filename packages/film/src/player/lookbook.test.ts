// The look-book is set in the film's own type: the family of its shorts'
// fonts, read off a CSS font whatever its weight, size or line height. Its
// sheet is one canvas, so it stays within the largest canvas Chromium backs,
// however many stills a film has.

import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import { createFilm } from '../canvas/film.ts';
import { standInDom } from '../canvas/fixtures/stand-in.ts';
import { composeLookbook, familyOf } from './lookbook.ts';

describe('familyOf', () => {
  test("what follows a CSS font's size", () => {
    expect(familyOf('600 64px "Fraunces"')).toBe('"Fraunces"');
    expect(familyOf('italic 700 18.5px/1.2 "EB Garamond", serif')).toBe('"EB Garamond", serif');
    expect(familyOf('600 60px serif')).toBe('serif');
  });

  test('a font it cannot read sets in sans-serif', () => {
    expect(familyOf('bold')).toBe('sans-serif');
  });
});

describe('composeLookbook', () => {
  /** A film of `n` one-line scenes: a row of stills each, the sheet growing a row a scene. */
  const filmOf = (n: number) =>
    createFilm({
      title: 'long',
      paper: { base: '#fff', tone: '#000', seed: 1 },
      shade: '#000',
      scenes: Array.from({ length: n }, (_, i) => ({
        id: `s${i}`,
        say: 'A line.',
        draw: () => undefined,
      })),
    });

  const compose = (n: number) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.andThen(
          standInDom(),
          Effect.promise(() => composeLookbook(filmOf(n), { captions: false })),
        ),
      ),
    );

  test("a film too long for one sheet at full size is scaled to Chromium's largest canvas side", async () => {
    const { canvas, tiles } = await compose(160);
    expect(canvas.height).toBeLessThanOrEqual(32_767);
    const last = tiles.at(-1);
    expect(last).toBeDefined();
    expect((last?.y ?? 0) + (last?.h ?? 0)).toBeLessThanOrEqual(canvas.height);
    expect((last?.x ?? 0) + (last?.w ?? 0)).toBeLessThanOrEqual(canvas.width);
  });

  test('a film that fits is laid out at full size', async () => {
    const { canvas, tiles } = await compose(3);
    expect(canvas.width).toBe(2036);
    expect(tiles.map((t) => t.w)).toEqual([320, 320, 320]);
  });
});
