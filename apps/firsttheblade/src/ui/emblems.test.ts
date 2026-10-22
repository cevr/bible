import { BunServices } from '@effect/platform-bun';
import { test as plain } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path } from 'effect';

import { withLeaf } from './emblems.ts';

const test = it.effect.layer(BunServices.layer);

const read = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs.readFileString(path.join(import.meta.dir, file));
  });

const EMBLEMS = ['path', 'land', 'taught', 'remedies'] as const;

/** Every clip id a drawing names. */
const clips = (svg: string) =>
  Array.from(svg.matchAll(/<clipPath id="([^"]+)"/g), (found) => found[1]);

describe('the emblems laid in the page', () => {
  test('the book gains its leaf under the spine, after both its pages', () =>
    Effect.gen(function* () {
      const book = yield* read('../art/emblem-taught.svg');
      const turned = withLeaf(book);
      const from = turned.indexOf('<g class="leaf">');
      const leaf = turned.slice(from, turned.indexOf('</g>', from) + '</g>'.length);
      expect(turned.replace(leaf, '')).toBe(book);
      expect(turned.indexOf('<clipPath id="k14">')).toBeLessThan(from);
      expect(from).toBeLessThan(turned.indexOf('<clipPath id="k15">'));
      expect(clips(leaf)).toEqual(['k20', 'k21']);
    }));

  test('the leaf is the right page and its lines, drawn as the book draws them, with a shade on its front', () =>
    Effect.gen(function* () {
      const book = yield* read('../art/emblem-taught.svg');
      const turned = withLeaf(book);
      const from = turned.indexOf('<g class="leaf">');
      const leaf = turned.slice(from, turned.indexOf('</g>', from));
      const page = 'M50 36C60 30 74 30 86 34L86 74C74 70 60 70 50 76Z';
      const lines = 'M56 45C62 42 70 42 78 44M56 53C62 50 70 50 78 52';
      expect(book).toContain(`d="${page}"`);
      // The book draws both pages' lines as one path; the right page's are its second half.
      expect(book).toContain(`${lines}"`);
      expect(new Set(Array.from(leaf.matchAll(/ d="([^"]+)"/g), (found) => found[1]))).toEqual(
        new Set([page, lines]),
      );
      expect(
        Array.from(leaf.matchAll(/class="leaf-shade" d="([^"]+)"/g), (found) => found[1]),
      ).toEqual([page]);
    }));

  plain('a drawing with no spine is left as it is', () => {
    expect(withLeaf('<svg></svg>')).toBe('<svg></svg>');
  });

  test('no two drawings on a page name the same clip, so one card’s clip cannot cut another’s', () =>
    Effect.gen(function* () {
      const drawings = yield* Effect.forEach(EMBLEMS, (id) => read(`../art/emblem-${id}.svg`));
      const ids = drawings.map(withLeaf).flatMap(clips);
      expect(new Set(ids).size).toBe(ids.length);
    }));
});
