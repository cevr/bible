import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Result, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { Hymn } from './hymn.js';

const fit = {
  notes: 4,
  syllables: 4,
  melismas: 0,
  shared: { inWord: 0, acrossWords: 0 },
  cost: 0.5,
};

const sung = {
  _tag: 'Sung',
  level: 'syllable',
  lines: [
    [
      {
        text: 'Ho',
        word: 0,
        notes: 1,
        beats: 1,
        full: [{ chord: { root: 0, quality: '' }, at: 0 }],
      },
      {
        text: 'ly,',
        word: 0,
        notes: 2,
        beats: 2,
        full: [
          { chord: { root: 7, quality: '7', bass: 11 }, at: 0 },
          { chord: { root: 0, quality: '' }, at: 1.5 },
        ],
        guitar: [{ chord: { root: 7, quality: '7' }, at: 0 }],
      },
      { text: 'ho', word: 1, notes: 0, beats: 0 },
    ],
  ],
  fit,
  why: [],
} as const;

const hymn: Hymn = {
  version: 1,
  book: 'sdah-1985',
  number: 7,
  title: 'A Test',
  key: { tonic: 'Eb', minor: false },
  meter: { numerator: 3, denominator: 4 },
  verses: { text: 2, midi: 2, exact: true },
  stanzas: [sung, { _tag: 'Plain', lines: ['Holy, holy'], fit, why: ['notes', 'inexact'] }],
  refrain: { _tag: 'Plain', lines: ['Amen'], why: ['held'] },
};

const json = Schema.fromJsonString(Hymn);
const decode = Schema.decodeUnknownEffect(Hymn);
const { level: _, ...noLevel } = sung;

describe('Hymn', () => {
  it.effect('round-trips through the schema as JSON', () =>
    Effect.gen(function* () {
      const text = yield* Schema.encodeEffect(json)(hymn);
      expect(yield* Schema.decodeEffect(json)(text)).toEqual(hymn);
    }),
  );

  it.effect(
    'refuses a plain part with syllables, and a sung part with no level or a plain one with no reason',
    () =>
      Effect.gen(function* () {
        const refused = [
          { ...hymn, stanzas: [{ ...sung, _tag: 'Plain' }] },
          { ...hymn, stanzas: [noLevel] },
          { ...hymn, stanzas: [{ _tag: 'Plain', lines: ['Holy'], why: [] }] },
        ];
        for (const value of refused) {
          expect(Result.isFailure(yield* Effect.result(decode(value)))).toBe(true);
        }
      }),
  );

  it.effect('keeps no chord beside a plain part: decoding drops it, or refuses it when asked', () =>
    Effect.gen(function* () {
      const chorded = {
        ...hymn,
        stanzas: [
          {
            _tag: 'Plain',
            lines: ['Holy'],
            why: ['notes'],
            full: [{ chord: { root: 0, quality: '' }, at: 0 }],
          },
        ],
      };
      const read = yield* decode(chorded);
      expect(read.stanzas[0]).toEqual({ _tag: 'Plain', lines: ['Holy'], why: ['notes'] });
      const strict = decode(chorded, { onExcessProperty: 'error' });
      expect(Result.isFailure(yield* Effect.result(strict))).toBe(true);
    }),
  );

  it.effect('imports nothing but effect, and chord.ts nothing but effect', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const transpiler = new Bun.Transpiler({ loader: 'ts' });
      const imports = (file: string) =>
        fs
          .readFileString(new URL(file, import.meta.url).pathname)
          .pipe(Effect.map((code) => transpiler.scanImports(code).map((i) => i.path)));
      expect(yield* imports('./hymn.ts')).toEqual(['effect', './chord.js']);
      expect(yield* imports('./chord.ts')).toEqual(['effect']);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
