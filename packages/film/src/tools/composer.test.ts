// Composer with fakes: without an API key the effects are skipped with a
// warning and the score is still made and recorded under its hash.

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
  effects: {
    page: { prompt: 'a page turns', secs: 1, at: [{ scene: 'open', offset: 1 }] },
  },
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

  it.effect('without a key, skips the effects and still makes the music', () =>
    Effect.gen(function* () {
      const film = { ...testFilm(scenes, timings), sound: Option.some(sound) };
      yield* (yield* Composer).score(film, { only: Option.none(), dryRun: false });

      expect(calls.effects).toEqual([]);
      const plan = Result.getOrThrow(musicPlan(music, layout(scenes, timings)));
      const hash = musicKey(music, plan);
      expect(calls.music).toEqual([`/films/test/sound/music-${hash}.mp3`]);
      const manifest = yield* Schema.decodeEffect(SoundManifestJson)(
        new TextDecoder().decode(files.get(MANIFEST)),
      );
      expect(manifest).toEqual({ music: { hash, file: `music-${hash}.mp3` }, effects: {} });
    }).pipe(Effect.provide(layer)),
  );
});
