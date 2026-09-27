// This film's mix. The plan is pinned to the decisions the pre-Effect ffmpeg
// graph made (fixtures/mix-plan.json, converted from its argv; `<app>` stands
// for this app's directory): voice and score as committed, and with every
// effect generated so each cue's placement is checked too. The track is
// pinned to the master ffmpeg n9.0.1 mixed from the same takes and score
// (fixtures/mix-levels.json: mean and peak dBFS per 10-second window), which
// the TypeScript mix matched to a −98.8 dB residual, never more than 1 LSB.

import { BunServices } from '@effect/platform-bun';
import {
  type MixPlan,
  type SoundManifest,
  SoundManifestJson,
  TimingsJson,
  effectKey,
  layout,
  levels,
  mixPlan,
  renderMix,
} from '@bible/film/core';
import { Media, decodePlan } from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Path, Result, Schema } from 'effect';
import { scenes } from '../src/films/righteousness-by-faith-v1/scenes/index.ts';
import { sound } from '../src/films/righteousness-by-faith-v1/sound.ts';

const Placed = Schema.Struct({ sound: Schema.String, ms: Schema.Int, gain: Schema.Finite });
const Plan = Schema.Struct({
  seconds: Schema.Finite,
  voice: Schema.Array(Placed),
  music: Schema.Struct({ sound: Schema.String, gain: Schema.Finite }),
  effects: Schema.Array(Placed),
});
const Plans = Schema.fromJsonString(Schema.Struct({ plain: Plan, effects: Plan }));
const Levels = Schema.fromJsonString(
  Schema.Struct({
    window: Schema.Finite,
    frames: Schema.Int,
    levels: Schema.Array(Schema.Tuple([Schema.Finite, Schema.Finite])),
  }),
);

const FILM = 'src/films/righteousness-by-faith-v1';

/** The ffmpeg master's levels hold to this, in dB: far above an LSB, far below anything audible. */
const LEVEL_TOLERANCE = 0.01;

const load = Effect.fn('test.load')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const read = (file: string) => fs.readFileString(path.join(import.meta.dir, file));
  const timings = yield* Schema.decodeEffect(TimingsJson)(
    yield* read(`../${FILM}/narration/timings.json`),
  );
  const manifest = yield* Schema.decodeEffect(SoundManifestJson)(
    yield* read(`../${FILM}/sound/manifest.json`),
  );
  const plans = yield* Schema.decodeEffect(Plans)(yield* read('fixtures/mix-plan.json'));
  const golden = yield* Schema.decodeEffect(Levels)(yield* read('fixtures/mix-levels.json'));
  const app = path.join(import.meta.dir, '..');
  return { placed: layout(scenes, timings), manifest, plans, golden, app };
});

/** The plan with sounds under `dir` (this app's directory, or `<app>`). */
const plan = (placed: ReturnType<typeof layout>, manifest: SoundManifest, dir: string) =>
  Result.getOrThrow(
    mixPlan({
      placed,
      sound: Option.some(sound),
      manifest,
      narration: `${dir}/${FILM}/narration`,
      soundDir: `${dir}/${FILM}/sound`,
    }),
  );

/** A plan as the fixture pins it: each start to the millisecond, as the ffmpeg graph placed it. */
const pinned = (made: MixPlan<string>): typeof Plan.Type => ({
  seconds: made.seconds,
  voice: made.voice.map((p) => ({ sound: p.sound, ms: Math.round(p.at * 1000), gain: p.gain })),
  music: Option.getOrThrow(made.music),
  effects: made.effects.map((p) => ({ sound: p.sound, ms: Math.round(p.at * 1000), gain: p.gain })),
});

describe('mix', () => {
  it.effect.layer(BunServices.layer)('the plan: voice and score, as committed', () =>
    Effect.gen(function* () {
      const { placed, manifest, plans } = yield* load();
      const made = plan(placed, manifest, '<app>');
      // No effect is generated yet: each is named, and the mix plays without it.
      expect(made.warnings).toEqual(
        Object.keys(sound.effects).map(
          (id) => `mix.missing effect=${id} hint="run score to generate it"`,
        ),
      );
      expect(pinned(made)).toEqual(plans.plain);
    }),
  );

  it.effect.layer(BunServices.layer)('the plan: with every effect generated', () =>
    Effect.gen(function* () {
      const { placed, manifest, plans } = yield* load();
      const effects = Object.fromEntries(
        Object.entries(sound.effects).map(([id, fx]) => {
          const hash = effectKey(fx);
          return [id, { hash, file: `sfx-${id}-${hash}.mp3` }];
        }),
      );
      expect(pinned(plan(placed, { ...manifest, effects }, '<app>'))).toEqual(plans.effects);
    }),
  );

  it.effect.layer(Layer.provideMerge(Media.layer, BunServices.layer))(
    'the track: the levels of the master ffmpeg mixed, window by window',
    () =>
      Effect.gen(function* () {
        const { placed, manifest, golden, app } = yield* load();
        const mixed = renderMix(yield* decodePlan(yield* Media, plan(placed, manifest, app)));
        const { master } = mixed;
        expect(master.frames).toBe(golden.frames);
        const size = golden.window * master.rate;
        const windows = golden.levels.map(([mean, peak], k) => {
          const at = k * size;
          const frames = Math.min(size, master.frames - at);
          const window = levels({
            ...master,
            frames,
            channels: master.channels.map((c) => c.subarray(at, at + frames)),
          });
          const drift = Math.max(Math.abs(window.mean - mean), Math.abs(window.peak - peak));
          return { from: k * golden.window, window, golden: { mean, peak }, drift };
        });
        expect(windows.filter((w) => w.drift > LEVEL_TOLERANCE)).toEqual([]);
      }),
    30_000,
  );
});
