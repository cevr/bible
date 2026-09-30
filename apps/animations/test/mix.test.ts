// The mix, on the fixture film (`fixtures/films/tiny`) and the fixture sound
// library (`fixtures/sounds`). The plan is pinned (fixtures/mix-plan.json;
// `<app>` stands for this app's directory): as committed (voice, score, and
// procedural room tone and effects, each cue's placement a scene offset, a
// cue's start or a cue's end); and with the library's generated sounds placed
// too, over a faked lock, so each variant's rotation, jitter and level from
// its measured loudness is checked. How the mix sounds is checked by ear and
// its change by diff; the mixing itself is tested on synthetic sound in
// `@bible/film` (core/mix.test.ts).

import { BunServices } from '@effect/platform-bun';
import {
  type Lock,
  type MixPlan,
  type Placement,
  type Sound,
  type SoundManifest,
  SoundManifestJson,
  type SoundSource,
  type Sounds,
  TimingsJson,
  type Variant,
  layout,
  mixPlan,
  requestKey,
  sourceLabel,
} from '@bible/film/core';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Result, Schema } from 'effect';
import { scenes } from './fixtures/films/tiny/scenes/index.ts';
import { sound } from './fixtures/films/tiny/sound.ts';
import { library } from './fixtures/sounds/library.ts';

const Placed = Schema.Struct({
  sound: Schema.String,
  ms: Schema.Int,
  gain: Schema.Finite,
  pitch: Schema.Finite,
});
const Span = Schema.Struct({
  sound: Schema.String,
  from: Schema.Int,
  to: Schema.Int,
  gain: Schema.Finite,
  fade: Schema.Finite,
  duck: Schema.Boolean,
});
const Plan = Schema.Struct({
  seconds: Schema.Finite,
  voice: Schema.Array(Placed),
  score: Schema.Struct({
    option: Schema.String,
    sound: Schema.String,
    under: Schema.Finite,
    alone: Schema.Finite,
  }),
  beds: Schema.Array(Span),
  effects: Schema.Array(Placed),
});
const Plans = Schema.fromJsonString(Schema.Struct({ plain: Plan, made: Plan }));

const FILM = 'test/fixtures/films/tiny';
const SOUNDS = 'test/fixtures/sounds';

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
  return { placed: layout(scenes, timings), manifest, plans };
});

/** A made variant of `name`, measured at `momentaryMax` (and integrated 4 dB under it). */
const variant = (name: keyof typeof library, n: number, momentaryMax: number): Variant => ({
  request: requestKey(library[name]),
  file: `files/${name}/${n}.flac`,
  sha256: `${n}`,
  made: '2026-09-29T00:00:00Z',
  model: 'eleven_text_to_sound_v2',
  format: 'pcm_44100',
  secs: 1,
  loudness: { integrated: momentaryMax - 4, momentaryMax, peak: -1 },
  licence: 'elevenlabs-paid-sfx',
  credits: 40,
});

/** Every generated sound the fixture film places, made and kept. */
const made: Lock = {
  'paper.page': {
    variants: [variant('paper.page', 1, -18), variant('paper.page', 2, -22)],
    candidates: [],
    rejected: [],
  },
  'paper.fold': { variants: [variant('paper.fold', 1, -20)], candidates: [], rejected: [] },
  'amb.hall': { variants: [variant('amb.hall', 1, -30)], candidates: [], rejected: [] },
};

/** The fixture's sound, with the library's generated sounds placed beside its procedural ones. */
const generated: Sound = {
  ...sound,
  beds: [
    ...(sound.beds ?? []),
    { sound: 'amb.hall', from: { scene: 'open' }, to: { scene: 'turn', cue: 'fold' } },
  ],
  effects: {
    ...sound.effects,
    leaf: { sound: 'paper.page', at: [{ scene: 'turn', offset: 0.5 }, { scene: 'close' }] },
    crease: { sound: 'paper.fold', level: -14, at: [{ scene: 'open', cue: 'rise', edge: 'end' }] },
  },
};

/** The plan, with the film's files under `<app>`. */
const plan = (
  placed: ReturnType<typeof layout>,
  manifest: SoundManifest,
  lock: Lock,
  played: Sound = sound,
) => {
  const dir = '<app>';
  const sounds: Sounds = { library, lock, dir: `${dir}/${SOUNDS}` };
  return Result.getOrThrow(
    mixPlan({
      film: 'tiny',
      placed,
      sound: Option.some(played),
      manifest,
      sounds,
      narration: `${dir}/${FILM}/narration`,
      soundDir: `${dir}/${FILM}/sound`,
      play: Option.none(),
    }),
  );
};

const ms = (s: number) => Math.round(s * 1000);

/** A placement as the fixture pins it: its source's label, its start to the millisecond. */
const placement = (p: Placement<SoundSource>): typeof Placed.Type => ({
  sound: sourceLabel(p.sound),
  ms: ms(p.at),
  gain: p.gain,
  pitch: p.pitch,
});

/** A plan as the fixture pins it. */
const pinned = (planned: MixPlan<SoundSource>): typeof Plan.Type => ({
  seconds: planned.seconds,
  voice: planned.voice.map(placement),
  score: Option.match(planned.score, {
    onNone: () => ({ option: '', sound: '', under: 0, alone: 0 }),
    onSome: (s) => ({
      option: s.option,
      sound: sourceLabel(s.sound),
      under: s.under,
      alone: s.alone,
    }),
  }),
  beds: planned.beds.map((b) => ({
    sound: sourceLabel(b.sound),
    from: ms(b.from),
    to: ms(b.to),
    gain: b.gain,
    fade: b.fade,
    duck: b.duck,
  })),
  effects: planned.effects.map(placement),
});

describe('mix', () => {
  it.effect.layer(BunServices.layer)('the plan: as committed', () =>
    Effect.gen(function* () {
      const { placed, manifest, plans } = yield* load();
      const planned = plan(placed, manifest, {});
      expect(planned.warnings).toEqual([]);
      expect(pinned(planned)).toEqual(plans.plain);
    }),
  );

  it.effect.layer(BunServices.layer)(
    'the plan: an unmade generated sound is named once, and the mix plays without it',
    () =>
      Effect.gen(function* () {
        const { placed, manifest, plans } = yield* load();
        const planned = plan(placed, manifest, {}, generated);
        expect(planned.warnings).toEqual(
          ['amb.hall', 'paper.page', 'paper.fold'].map(
            (name) => `mix.missing sound=${name} hint="run sfx make ${name}, then sfx keep"`,
          ),
        );
        expect(pinned(planned)).toEqual(plans.plain);
      }),
  );

  it.effect.layer(BunServices.layer)('the plan: with every library sound made', () =>
    Effect.gen(function* () {
      const { placed, manifest, plans } = yield* load();
      const planned = plan(placed, manifest, made, generated);
      expect(planned.warnings).toEqual([]);
      expect(pinned(planned)).toEqual(plans.made);
    }),
  );
});
