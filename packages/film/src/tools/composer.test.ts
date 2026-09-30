// Composer with fakes: each score option is composed and recorded under its
// hash with its bytes' sha256, a current option is never composed again, one
// option can be composed alone, and the cap refuses a run before it spends.
// Effects are the library's: `score` never makes one.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Path, Result, Schema } from 'effect';
import { layout } from '../core/layout.ts';
import {
  type Music,
  type Sound,
  SoundManifestJson,
  type Timed,
  type Timings,
} from '../core/schema.ts';
import { musicKey, musicPlan } from '../core/sound.ts';
import { Composer, type ScoreOptions, musicCredits } from './composer.ts';
import { emptyCalls, fakeElevenLabs, memoryFileSystem, storeLayer, testFilm } from './testing.ts';

const scenes: ReadonlyArray<Timed> = [
  { id: 'open', min: 8 },
  { id: 'close', min: 8 },
];

const piano: Music = {
  model: 'music_v2',
  styles: ['felt piano'],
  avoid: ['drums'],
  acts: [
    { from: 'open', name: 'Opening', styles: ['quiet'] },
    { from: 'close', name: 'Closing', styles: ['warm'] },
  ],
};
const pads: Music = { ...piano, styles: ['ambient pads'] };

const sound: Sound = {
  score: { play: 'piano', under: -18, alone: -6, options: { piano, pads } },
  effects: { page: { sound: 'paper.page', at: [{ scene: 'open', offset: 1 }] } },
};

const timings: Timings = { voice: '', scenes: {} };

const MANIFEST = '/films/test/sound/manifest.json';
const TALLY = '/films/test/tally.tsv';

const run: ScoreOptions = {
  force: false,
  dryRun: false,
  only: Option.none(),
  cap: Option.none(),
  tally: Option.none(),
};

const keyOf = (music: Music) =>
  musicKey(music, Result.getOrThrow(musicPlan(music, layout(scenes, timings))));

describe('Composer', () => {
  const setup = () => {
    const files = new Map<string, Uint8Array>();
    const calls = emptyCalls();
    const layer = Composer.layer.pipe(
      Layer.provide(storeLayer(files)),
      Layer.provide([memoryFileSystem(files), Path.layer, fakeElevenLabs(files, calls)]),
    );
    const manifest = () =>
      Schema.decodeEffect(SoundManifestJson)(new TextDecoder().decode(files.get(MANIFEST)));
    return { files, calls, layer, manifest };
  };
  const film = { ...testFilm(scenes, timings), sound: Option.some(sound) };

  it.effect('composes each option once, keeps its sha256, and never an effect', () => {
    const { files, calls, layer, manifest } = setup();
    return Effect.gen(function* () {
      yield* (yield* Composer).score(film, run);
      expect(calls.effects).toEqual([]);
      const [p, q] = [keyOf(piano), keyOf(pads)];
      expect(calls.music).toEqual([
        `/films/test/sound/piano-${p}.mp3`,
        `/films/test/sound/pads-${q}.mp3`,
      ]);
      const sha = (file: string) =>
        createHash('sha256')
          .update(files.get(file) ?? new Uint8Array())
          .digest('hex');
      const made = yield* manifest();
      expect(made).toEqual({
        scores: {
          piano: {
            hash: p,
            file: `piano-${p}.mp3`,
            sha256: sha(`/films/test/sound/piano-${p}.mp3`),
          },
          pads: { hash: q, file: `pads-${q}.mp3`, sha256: sha(`/films/test/sound/pads-${q}.mp3`) },
        },
      });

      yield* (yield* Composer).score({ ...film, manifest: made }, run);
      expect(calls.music).toHaveLength(2);
    }).pipe(Effect.provide(layer));
  });

  it.effect('composes one option alone; a name the score lacks fails', () => {
    const { calls, layer } = setup();
    return Effect.gen(function* () {
      const composer = yield* Composer;
      yield* composer.score(film, { ...run, only: Option.some('pads') });
      expect(calls.music).toEqual([`/films/test/sound/pads-${keyOf(pads)}.mp3`]);
      const lost = yield* Effect.flip(composer.score(film, { ...run, only: Option.some('organ') }));
      expect(lost._tag).toBe('ScoreUnknown');
    }).pipe(Effect.provide(layer));
  });

  it.effect('a dry run composes nothing; the cap refuses what the tally would pass', () => {
    const { files, calls, layer } = setup();
    return Effect.gen(function* () {
      const composer = yield* Composer;
      yield* composer.score(film, { ...run, dryRun: true });
      expect(calls.music).toEqual([]);
      const each = musicCredits(Result.getOrThrow(musicPlan(piano, layout(scenes, timings))));
      // Room for one option: the first is composed and tallied, the second refused.
      const over = yield* Effect.flip(
        composer.score(film, { ...run, cap: Option.some(each + 1), tally: Option.some(TALLY) }),
      );
      expect(over._tag).toBe('CreditsOverCap');
      expect(calls.music).toHaveLength(1);
      expect(new TextDecoder().decode(files.get(TALLY)).split('\n').slice(1, 2)).toEqual([
        `score.piano\t${keyOf(piano)}\t16.000\t${each}`,
      ]);
    }).pipe(Effect.provide(layer));
  });
});
