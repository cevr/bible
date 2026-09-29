// Composer with fakes: the score is made and recorded under its hash, and a
// current score is never made again. Effects are the library's: `score`
// never makes one.

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
import { Composer } from './composer.ts';
import { emptyCalls, fakeElevenLabs, memoryFileSystem, storeLayer, testFilm } from './testing.ts';

const scenes: ReadonlyArray<Timed> = [
  { id: 'open', min: 8 },
  { id: 'close', min: 8 },
];

const music: Music = {
  model: 'music_v2',
  styles: ['paper'],
  avoid: ['drums'],
  acts: [
    { from: 'open', name: 'Opening', styles: ['quiet'] },
    { from: 'close', name: 'Closing', styles: ['warm'] },
  ],
  gain: 0.5,
};

const sound: Sound = {
  music,
  effects: { page: { sound: 'paper.page', at: [{ scene: 'open', offset: 1 }] } },
};

const timings: Timings = { voice: '', scenes: {} };

const MANIFEST = '/films/test/sound/manifest.json';

describe('Composer', () => {
  const files = new Map<string, Uint8Array>();
  const calls = emptyCalls();
  const layer = Composer.layer.pipe(
    Layer.provide(storeLayer(files)),
    Layer.provide([memoryFileSystem(files), Path.layer, fakeElevenLabs(files, calls)]),
  );

  it.effect('makes the score once, and never an effect', () =>
    Effect.gen(function* () {
      const film = { ...testFilm(scenes, timings), sound: Option.some(sound) };
      yield* (yield* Composer).score(film, { force: false, dryRun: false });

      expect(calls.effects).toEqual([]);
      const plan = Result.getOrThrow(musicPlan(music, layout(scenes, timings)));
      const hash = musicKey(music, plan);
      expect(calls.music).toEqual([`/films/test/sound/music-${hash}.mp3`]);
      const manifest = yield* Schema.decodeEffect(SoundManifestJson)(
        new TextDecoder().decode(files.get(MANIFEST)),
      );
      expect(manifest).toEqual({ music: { hash, file: `music-${hash}.mp3` } });

      const made = { ...film, manifest };
      yield* (yield* Composer).score(made, { force: false, dryRun: false });
      expect(calls.music).toHaveLength(1);
    }).pipe(Effect.provide(layer)),
  );
});
