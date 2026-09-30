// Committed film data is the contract the Schemas and keys must keep: paid
// takes and the score are keyed by these files and hashes, so a codec or key
// change that moved a single byte would orphan them. The codecs and keys are
// held on the fixture film (`fixtures/films/tiny`), pinned to the values it
// was committed with; the live film's own data is checked for being current.

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
  takeScript,
  voiceKey,
} from '@bible/film/core';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema, Result } from 'effect';
import { FILMS } from '../server.ts';
import { scenes as liveScenes } from '../src/films/righteousness-by-faith/scenes/index.ts';
import { voice as liveVoice } from '../src/films/righteousness-by-faith/voice.ts';
import { FIXTURE_FILMS } from './fixtures/cli.ts';
import { scenes } from './fixtures/films/tiny/scenes/index.ts';
import { sound } from './fixtures/films/tiny/sound.ts';
import { voice } from './fixtures/films/tiny/voice.ts';

/** A file of the film at `root`/`film`, as committed. */
const readFilmFile = Effect.fn('test.readFilmFile')(function* (
  root: string,
  film: string,
  file: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* fs.readFileString(path.join(root, film, file));
});

const fixture = (file: string) => readFilmFile(FIXTURE_FILMS, 'tiny', file);
const live = (file: string) => readFilmFile(FILMS, 'righteousness-by-faith', file);

describe('film data codecs and keys (fixture film)', () => {
  it.effect.layer(BunServices.layer)('timings.json decodes and re-encodes byte for byte', () =>
    Effect.gen(function* () {
      const text = yield* fixture('narration/timings.json');
      const timings = yield* Schema.decodeEffect(TimingsJson)(text);
      expect(yield* Schema.encodeEffect(TimingsJson)(timings)).toBe(text);
    }),
  );

  it.effect.layer(BunServices.layer)('manifest.json decodes and re-encodes byte for byte', () =>
    Effect.gen(function* () {
      const text = yield* fixture('sound/manifest.json');
      const manifest = yield* Schema.decodeEffect(SoundManifestJson)(text);
      expect(yield* Schema.encodeEffect(SoundManifestJson)(manifest)).toBe(text);
    }),
  );

  it.effect.layer(BunServices.layer)('the voice and every take keep their committed keys', () =>
    Effect.gen(function* () {
      const timings = yield* Schema.decodeEffect(TimingsJson)(
        yield* fixture('narration/timings.json'),
      );
      expect(voiceKey(yield* Schema.decodeEffect(Voice)(voice))).toBe(timings.voice);
      // Pinned, not recomputed: a change to the take hash would orphan every take.
      expect(timings.scenes['open']?.hash).toBe('af95d9f8');
      for (const scene of scenes)
        expect(timings.scenes[scene.id]?.hash).toBe(
          hashText(takeScript(Result.getOrThrow(parse(scene.id, scene.say ?? '')))),
        );
    }),
  );

  it.effect.layer(BunServices.layer)('the score keeps the key of its committed asset', () =>
    Effect.gen(function* () {
      const timings = yield* Schema.decodeEffect(TimingsJson)(
        yield* fixture('narration/timings.json'),
      );
      const decoded = yield* Schema.decodeEffect(Sound)(sound);
      const music = yield* Effect.fromOption(Option.fromNullishOr(decoded.score?.options['piano']));
      const plan = yield* Effect.fromResult(
        musicPlan(music, Result.getOrThrow(layout(scenes, timings))),
      );
      expect(musicKey(music, plan)).toBe('20920098');
    }),
  );
});

describe('righteousness-by-faith data', () => {
  it.effect.layer(BunServices.layer)('timings.json decodes and re-encodes byte for byte', () =>
    Effect.gen(function* () {
      const text = yield* live('narration/timings.json');
      const timings = yield* Schema.decodeEffect(TimingsJson)(text);
      expect(yield* Schema.encodeEffect(TimingsJson)(timings)).toBe(text);
    }),
  );

  it.effect.layer(BunServices.layer)('every take is current for its voice and its words', () =>
    Effect.gen(function* () {
      const timings = yield* Schema.decodeEffect(TimingsJson)(
        yield* live('narration/timings.json'),
      );
      expect(voiceKey(yield* Schema.decodeEffect(Voice)(liveVoice))).toBe(timings.voice);
      for (const scene of liveScenes) {
        const take = Option.fromNullishOr(timings.scenes[scene.id]);
        if (Option.isSome(take))
          expect(take.value.hash).toBe(
            hashText(takeScript(Result.getOrThrow(parse(scene.id, scene.say ?? '')))),
          );
      }
    }),
  );
});
