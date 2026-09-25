// The mix graph for this film, pinned to the exact ffmpeg arguments the
// pre-Effect mix script produced (fixtures/mix-argv.json, `<app>` standing for
// this app's directory): voice only as committed, with stems, and with every
// effect generated so each cue's placement is checked too.

import { BunServices } from '@effect/platform-bun';
import {
  type SoundManifest,
  SoundManifestJson,
  TimingsJson,
  effectKey,
  layout,
} from '@bible/film/core';
import { graph } from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Result, Schema } from 'effect';
import { scenes } from '../src/films/righteousness-by-faith/scenes/index.ts';
import { sound } from '../src/films/righteousness-by-faith/sound.ts';

const Fixtures = Schema.fromJsonString(
  Schema.Struct({
    plain: Schema.Array(Schema.String),
    stems: Schema.Array(Schema.String),
    effects: Schema.Array(Schema.String),
  }),
);

const film = '<app>/src/films/righteousness-by-faith';

const load = Effect.fn('test.load')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const read = (file: string) => fs.readFileString(path.join(import.meta.dir, file));
  const dir = '../src/films/righteousness-by-faith';
  const timings = yield* Schema.decodeEffect(TimingsJson)(
    yield* read(`${dir}/narration/timings.json`),
  );
  const manifest = yield* Schema.decodeEffect(SoundManifestJson)(
    yield* read(`${dir}/sound/manifest.json`),
  );
  const fixtures = yield* Schema.decodeEffect(Fixtures)(yield* read('fixtures/mix-argv.json'));
  return { placed: layout(scenes, timings), manifest, fixtures };
});

const argv = (
  placed: ReturnType<typeof layout>,
  manifest: SoundManifest,
  stems: Option.Option<string>,
) =>
  Result.map(
    graph({
      placed,
      sound: Option.some(sound),
      manifest,
      narration: `${film}/narration`,
      soundDir: `${film}/sound`,
      out: `${film}/narration/full.mp3`,
      stems,
    }),
    (mixed) => ['ffmpeg', ...mixed.args],
  );

describe('mix graph', () => {
  it.effect.layer(BunServices.layer)('voice and score, as committed', () =>
    Effect.gen(function* () {
      const { placed, manifest, fixtures } = yield* load();
      expect(Result.getOrThrow(argv(placed, manifest, Option.none()))).toEqual([...fixtures.plain]);
    }),
  );

  it.effect.layer(BunServices.layer)('with stems', () =>
    Effect.gen(function* () {
      const { placed, manifest, fixtures } = yield* load();
      const stems = Option.some('<app>/out/righteousness-by-faith/stems');
      expect(Result.getOrThrow(argv(placed, manifest, stems))).toEqual([...fixtures.stems]);
    }),
  );

  it.effect.layer(BunServices.layer)('with every effect generated', () =>
    Effect.gen(function* () {
      const { placed, manifest, fixtures } = yield* load();
      const effects = Object.fromEntries(
        Object.entries(sound.effects).map(([id, fx]) => {
          const hash = effectKey(fx);
          return [id, { hash, file: `sfx-${id}-${hash}.mp3` }];
        }),
      );
      const stems = Option.some('<app>/out/righteousness-by-faith/stems');
      const mixed = argv(placed, { ...manifest, effects }, stems);
      expect(Result.getOrThrow(mixed)).toEqual([...fixtures.effects]);
    }),
  );
});
