// The look-book is set in the film's own type: the family of its shorts'
// fonts, read off a CSS font whatever its weight, size or line height. Its
// sheet is one canvas, so it stays within the largest canvas Chromium backs,
// however many stills a film has.

import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import { createFilm } from '../canvas/film.ts';
import { standInDom } from '../canvas/fixtures/stand-in.ts';
import { composeLookbook, fontFamilyOf } from './lookbook-sheet.ts';
import { stillHref } from './lookbook.ts';

describe('fontFamilyOf', () => {
  test("what follows a CSS font's size", () => {
    expect(fontFamilyOf('600 64px "Fraunces"')).toBe('"Fraunces"');
    expect(fontFamilyOf('italic 700 18.5px/1.2 "EB Garamond", serif')).toBe('"EB Garamond", serif');
    expect(fontFamilyOf('600 60px serif')).toBe('serif');
  });

  test('a font it cannot read sets in sans-serif', () => {
    expect(fontFamilyOf('bold')).toBe('sans-serif');
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

  test("a still opens its scene in the lab at the still's time in that scene; a short's, its play page", () => {
    const film = filmOf(3);
    const second = film.placed[1];
    expect(second).toBeDefined();
    const start = second?.start ?? 0;
    const moment = { scene: 's1', frame: 0, time: start + 0.25, at: '60%' };
    expect(stillHref('long', film.placed, moment)).toBe('/films/long/lab/s1#t=0.25');
    expect(stillHref('long/shorts/hook', film.placed, moment)).toBe(
      `/films/long%2Fshorts%2Fhook/play#t=${Math.ceil((start + 0.25) * 1000 - 1e-6) / 1000}`,
    );
  });
});
