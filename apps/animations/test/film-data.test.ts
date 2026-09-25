// The committed film data is the contract the Schemas must keep: paid takes and
// the score are keyed by these files and hashes, so a codec or key change that
// moved a single byte would orphan them.

import { BunServices } from '@effect/platform-bun';
import {
  Sound,
  SoundManifestJson,
  TimingsJson,
  Voice,
  hashText,
  layout,
  musicKey,
  musicPlan,
  parse,
  voiceKey,
} from '@bible/film/core';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { scenes } from '../src/films/righteousness-by-faith/scenes/index.ts';
import { sound } from '../src/films/righteousness-by-faith/sound.ts';
import { voice } from '../src/films/righteousness-by-faith/voice.ts';

const readFilmFile = Effect.fn('test.readFilmFile')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* fs.readFileString(
    path.join(import.meta.dir, '..', 'src', 'films', 'righteousness-by-faith', file),
  );
});

describe('righteousness-by-faith data', () => {
  it.effect.layer(BunServices.layer)('timings.json decodes and re-encodes byte for byte', () =>
    Effect.gen(function* () {
      const text = yield* readFilmFile('narration/timings.json');
      const timings = yield* Schema.decodeEffect(TimingsJson)(text);
      expect(yield* Schema.encodeEffect(TimingsJson)(timings)).toBe(text);
    }),
  );

  it.effect.layer(BunServices.layer)('manifest.json decodes and re-encodes byte for byte', () =>
    Effect.gen(function* () {
      const text = yield* readFilmFile('sound/manifest.json');
      const manifest = yield* Schema.decodeEffect(SoundManifestJson)(text);
      expect(yield* Schema.encodeEffect(SoundManifestJson)(manifest)).toBe(text);
    }),
  );

  it.effect.layer(BunServices.layer)('the voice and every take keep their recorded keys', () =>
    Effect.gen(function* () {
      const timings = yield* Schema.decodeEffect(TimingsJson)(
        yield* readFilmFile('narration/timings.json'),
      );
      expect(voiceKey(yield* Schema.decodeEffect(Voice)(voice))).toBe(timings.voice);
      // A take recorded before the tools moved: its hash is pinned, not recomputed.
      expect(timings.scenes['1888']?.hash).toBe('175db6d2');
      for (const scene of scenes) {
        const take = Option.fromNullishOr(timings.scenes[scene.id]);
        if (Option.isSome(take))
          expect(take.value.hash).toBe(hashText(parse(scene.say ?? '').spoken));
      }
    }),
  );

  it.effect.layer(BunServices.layer)('the score keeps the key of its committed asset', () =>
    Effect.gen(function* () {
      const timings = yield* Schema.decodeEffect(TimingsJson)(
        yield* readFilmFile('narration/timings.json'),
      );
      const decoded = yield* Schema.decodeEffect(Sound)(sound);
      const music = yield* Effect.fromOption(Option.fromNullishOr(decoded.music));
      const plan = yield* Effect.fromResult(musicPlan(music, layout(scenes, timings)));
      expect(musicKey(music, plan)).toBe('be8be957');
    }),
  );
});
