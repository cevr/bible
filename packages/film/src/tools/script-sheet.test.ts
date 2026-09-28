// The reading sheet written for a film: from its script when it has one
// (with its sources), from its scenes when not, with the quotations its
// `quotes.jsonl` verifies. In memory; nothing is spent.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Path } from 'effect';
import type { Timed } from '../core/schema.ts';
import { writeSheet } from './script-sheet.ts';
import { memoryFileSystem, testFilm, text } from './testing.ts';

const scenes: ReadonlyArray<Timed> = [
  { id: 'open', say: 'He said {x}“be still” and it was so.' },
  { id: 'quiet' },
];

const QUOTES = '/films/test/quotes.jsonl';
const quote =
  '{"film":"test","ref":"Ps 46:10","author":"KJV","work":"Psalms","year":1611,"text":"Be still, and know that I am God."}';

const setup = (files: Map<string, Uint8Array>) =>
  Layer.mergeAll(memoryFileSystem(files), Path.layer);

describe('writeSheet', () => {
  it.effect('writes the sheet beside the renders, from the script and its verified quotes', () => {
    const files = new Map([[QUOTES, text(`${quote}\n\n`)]]);
    return Effect.gen(function* () {
      const written = yield* writeSheet(
        testFilm(scenes, { voice: '', scenes: {} }),
        Option.some([{ id: 'open', say: 'He said “be still” and it was so.', cite: ['Ps 46:10'] }]),
      );
      expect(written).toEqual({
        markdown: '/out/test/script-sheet.md',
        html: '/out/test/script-sheet.html',
        beats: 1,
      });
      const md = new TextDecoder().decode(files.get('/out/test/script-sheet.md'));
      expect(md).toContain('> “be still”\n> — KJV, Ps 46:10');
      expect(md).toContain('Sources: Ps 46:10');
      expect(files.has('/out/test/script-sheet.html')).toBe(true);
    }).pipe(Effect.provide(setup(files)));
  });

  it.effect("a film with no script reads its scenes' lines, and no quotes file is none", () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      yield* writeSheet(testFilm(scenes, { voice: '', scenes: {} }), Option.none());
      const md = new TextDecoder().decode(files.get('/out/test/script-sheet.md'));
      expect(md).toContain('He said');
      expect(md).toContain('> “be still”');
      expect(md).not.toContain('quiet');
    }).pipe(Effect.provide(setup(files)));
  });

  it.effect('a quotes line that is not a quote fails, naming the file', () => {
    const files = new Map([[QUOTES, text('{"ref": 3}\n')]]);
    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        writeSheet(testFilm(scenes, { voice: '', scenes: {} }), Option.none()),
      );
      expect(error).toMatchObject({ _tag: 'FileInvalid', file: QUOTES });
    }).pipe(Effect.provide(setup(files)));
  });
});
