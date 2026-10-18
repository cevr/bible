import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Result, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { Hymn, sung } from './hymn.js';

const fit = {
  notes: 4,
  syllables: 4,
  melismas: 0,
  shared: { inWord: 0, acrossWords: 0 },
  cost: 0.5,
};

const holy = {
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
  stanzas: [holy, { _tag: 'Plain', lines: ['Holy, holy'], fit, why: ['notes', 'inexact'] }],
  refrain: { order: 'after-each', part: { _tag: 'Plain', lines: ['Amen'], why: ['held'] } },
};

const json = Schema.fromJsonString(Hymn);
const decode = Schema.decodeUnknownEffect(Hymn);
const { level: _, ...noLevel } = holy;

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
          { ...hymn, stanzas: [{ ...holy, _tag: 'Plain', why: ['notes'] }] },
          { ...hymn, stanzas: [noLevel] },
          { ...hymn, stanzas: [{ _tag: 'Plain', lines: ['Holy'], why: [] }] },
        ];
        for (const value of refused) {
          expect(Result.isFailure(yield* Effect.result(decode(value)))).toBe(true);
        }
      }),
  );

  it.effect('refuses a plain part that carries chords at either level', () =>
    Effect.gen(function* () {
      const chord = [{ chord: { root: 0, quality: '' }, at: 0 }];
      const plain = { _tag: 'Plain', lines: ['Holy'], why: ['notes'] } as const;
      expect((yield* decode({ ...hymn, stanzas: [plain] })).stanzas[0]).toEqual(plain);
      for (const level of ['full', 'guitar']) {
        const chorded = { ...hymn, stanzas: [{ ...plain, [level]: chord }] };
        expect(Result.isFailure(yield* Effect.result(decode(chorded)))).toBe(true);
      }
    }),
  );

  it.effect('refuses a refrain without its order, or with an order the hymnal does not use', () =>
    Effect.gen(function* () {
      const part = { _tag: 'Plain', lines: ['Amen'], why: ['held'] } as const;
      const refused = [
        { ...hymn, refrain: part },
        { ...hymn, refrain: { part } },
        { ...hymn, refrain: { order: 'twice', part } },
        { ...hymn, refrain: { order: 'last', part } },
      ];
      for (const value of refused) {
        expect(Result.isFailure(yield* Effect.result(decode(value)))).toBe(true);
      }
    }),
  );

  it.effect('sings each stanza, and the refrain where its order places it', () =>
    Effect.sync(() => {
      const plain = (text: string) => ({ _tag: 'Plain', lines: [text], why: ['notes'] }) as const;
      const two: Hymn = { ...hymn, stanzas: [plain('one'), holy] };
      const { refrain: _none, ...bare } = two;
      const outline = (value: Hymn) => sung(value).map((line) => `${line.verse}:${line.text}`);
      const chorus = plain('Amen');
      expect(outline(bare)).toEqual(['1:one', '2:Holy, ho']);
      expect(outline({ ...two, refrain: { order: 'after-each', part: chorus } })).toEqual([
        '1:one',
        'refrain:Amen',
        '2:Holy, ho',
        'refrain:Amen',
      ]);
      expect(outline({ ...two, refrain: { order: 'first-and-after-each', part: chorus } })).toEqual(
        ['refrain:Amen', '1:one', 'refrain:Amen', '2:Holy, ho', 'refrain:Amen'],
      );
      expect(outline({ ...two, refrain: { order: 'first-and-last', part: chorus } })).toEqual([
        'refrain:Amen',
        '1:one',
        '2:Holy, ho',
        'refrain:Amen',
      ]);
      const [, second] = sung(bare);
      expect(second).toMatchObject({ verse: 2, line: 0, part: holy });
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
