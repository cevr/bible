// The mix plan, on the fixture film (`fixtures/films/tiny`) and the fixture
// sound library (`fixtures/sounds`), stated as the rules it follows rather
// than numbers from a past run: each recorded scene's take starts at its
// voice; the played score option plays at its declared levels; a bed runs
// from its `from` point to its `to` point, at its level against its measured
// loudness; each effect plays at each of its points (a scene's start plus an
// offset, a cue's start, a cue's end), a generated one nudged late by at most
// JITTER_DELAY and levelled against its variant's loudness within its jitter,
// its variants taking turns; and a generated sound not yet made is named once
// and the mix plays without it. How the mix sounds is checked by ear and its
// change by diff; the mixing itself is tested on synthetic sound in
// `@bible/film` (core/mix.test.ts), and variant choice and jitter in
// core/sfx.test.ts.

import { BunServices } from '@effect/platform-bun';
import {
  DEFAULT_JITTER,
  JITTER_DELAY,
  type Lock,
  type MixPlan,
  type Placed,
  type Sound,
  type SoundManifest,
  SoundManifestJson,
  type SoundSource,
  TimingsJson,
  type Variant,
  gainFor,
  layout,
  levelOf,
  mixPlan,
  requestKey,
  sourceLabel,
} from '@bible/film/core';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Result, Schema } from 'effect';
import { scenes } from './fixtures/films/tiny/scenes/index.ts';
import { sound } from './fixtures/films/tiny/sound.ts';
import { library } from './fixtures/sounds/library.ts';

const FILM = 'test/fixtures/films/tiny';
const SOUNDS = 'test/fixtures/sounds';
/** Where the plan's files live: `<app>` stands for this app's directory. */
const APP = '<app>';

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
  return { placed: Result.getOrThrow(layout(scenes, timings)), manifest };
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
    { sound: 'amb.hall', from: { scene: 'open', at: 'start' }, to: { scene: 'turn', cue: 'fold' } },
  ],
  effects: {
    ...sound.effects,
    leaf: {
      sound: 'paper.page',
      at: [
        { scene: 'turn', at: 'start', offset: 0.5 },
        { scene: 'close', at: 'start' },
      ],
    },
    crease: { sound: 'paper.fold', level: -14, at: [{ scene: 'open', cue: 'rise', edge: 'end' }] },
  },
};

/** The plan, with the film's files under `<app>`. */
const plan = (
  placed: ReadonlyArray<Placed>,
  manifest: SoundManifest,
  lock: Lock,
  played: Sound = sound,
) =>
  Result.getOrThrow(
    mixPlan({
      film: 'tiny',
      placed,
      sound: Option.some(played),
      manifest,
      sounds: { library, lock, dir: `${APP}/${SOUNDS}` },
      narration: `${APP}/${FILM}/narration`,
      soundDir: `${APP}/${FILM}/sound`,
      play: Option.none(),
    }),
  );

/** Scene `id` as the film placed it. */
const scene = (placed: ReadonlyArray<Placed>, id: string): Placed =>
  Option.getOrThrow(Option.fromUndefinedOr(placed.find((p) => p.spec.id === id)));

/** Where cue `cue` of scene `id` starts or ends, in film time. */
const cueAt = (placed: ReadonlyArray<Placed>, id: string, cue: string, edge: 'start' | 'end') => {
  const p = scene(placed, id);
  return p.start + Option.getOrThrow(Option.fromUndefinedOr(p.cues.get(cue)))[edge];
};

/** A plan without its warnings: what plays. */
const heard = (planned: MixPlan<SoundSource>) => {
  const { warnings: _, ...rest } = planned;
  return rest;
};

/** An effect's placements by effect name: when each starts, what it plays, its gain and pitch. */
const effectsOf = (planned: MixPlan<SoundSource>, name: string) =>
  planned.effects
    .filter((e) => e.name === name)
    .map((e) => ({ at: e.at, file: sourceLabel(e.sound), gain: e.gain, pitch: e.pitch }));

/** The loudness `made` records for a variant file of the fixture library. */
const loudnessOf = (file: string) =>
  Option.getOrThrow(
    Option.fromUndefinedOr(
      Object.values(made)
        .flatMap((entry) => entry.variants)
        .find((v) => file.endsWith(v.file)),
    ),
  ).loudness;

describe('mix', () => {
  it.effect.layer(BunServices.layer)('each recorded scene’s take starts at its voice', () =>
    Effect.gen(function* () {
      const { placed, manifest } = yield* load();
      const planned = plan(placed, manifest, {});
      expect(planned.warnings).toEqual([]);
      const recorded = placed.filter((p) => p.voice.recorded);
      expect(recorded.length).toBeGreaterThan(0);
      expect(planned.voice.map((v) => [v.name, v.at, sourceLabel(v.sound), v.gain])).toEqual(
        recorded.map((p) => [
          p.spec.id,
          p.start + p.speechStart,
          `${APP}/${FILM}/narration/${p.voice.file}`,
          1,
        ]),
      );
    }),
  );

  it.effect.layer(BunServices.layer)('the played score option plays at its levels', () =>
    Effect.gen(function* () {
      const { placed, manifest } = yield* load();
      const planned = plan(placed, manifest, {});
      const file = manifest.scores?.['piano']?.file;
      expect(
        Option.map(planned.score, (s) => [s.option, sourceLabel(s.sound), s.under, s.alone]),
      ).toEqual(Option.some(['piano', `${APP}/${FILM}/sound/${file}`, -18, -6]));
    }),
  );

  it.effect.layer(BunServices.layer)(
    'a bed runs from its point to its point, levelled against its loudness',
    () =>
      Effect.gen(function* () {
        const { placed, manifest } = yield* load();
        const planned = plan(placed, manifest, made, generated);
        expect(planned.warnings).toEqual([]);
        const [room, hall] = planned.beds;
        // room.paper: from turn's start to a second into close; it does not duck.
        expect([room?.from, room?.to, room?.duck]).toEqual([
          scene(placed, 'turn').start,
          scene(placed, 'close').start + 1,
          false,
        ]);
        // amb.hall: from open's start to the start of turn's cue `fold`, ducked,
        // at its level against the variant's integrated loudness.
        expect([hall?.from, hall?.to, hall?.duck, hall?.gain]).toEqual([
          scene(placed, 'open').start,
          cueAt(placed, 'turn', 'fold', 'start'),
          true,
          gainFor(
            levelOf(library['amb.hall'], Option.none()),
            loudnessOf('files/amb.hall/1.flac'),
            'bed',
          ),
        ]);
      }),
  );

  it.effect.layer(BunServices.layer)(
    'each effect plays at each of its points; a procedural one exactly there',
    () =>
      Effect.gen(function* () {
        const { placed, manifest } = yield* load();
        const planned = plan(placed, manifest, {});
        expect(effectsOf(planned, 'page').map((e) => [e.at, e.pitch])).toEqual([
          [scene(placed, 'turn').start + 0.05, 0],
        ]);
        const fold = effectsOf(planned, 'fold');
        expect(fold.map((e) => [e.at, e.pitch])).toEqual([
          [cueAt(placed, 'open', 'rise', 'start'), 0],
          [cueAt(placed, 'turn', 'fold', 'end'), 0],
        ]);
        // Its variants take turns: the second placement plays another one.
        expect(fold[0]?.file).not.toBe(fold[1]?.file);
        for (const e of planned.effects) expect(e.gain).toBeGreaterThan(0);
      }),
  );

  it.effect.layer(BunServices.layer)(
    'a generated effect is nudged within its jitter, levelled against its variant, its variants taking turns',
    () =>
      Effect.gen(function* () {
        const { placed, manifest } = yield* load();
        const planned = plan(placed, manifest, made, generated);
        const expected: ReadonlyArray<{
          readonly sound: 'paper.page' | 'paper.fold';
          readonly at: number;
          readonly level: Option.Option<number>;
        }> = [
          { sound: 'paper.page', at: scene(placed, 'turn').start + 0.5, level: Option.none() },
          { sound: 'paper.page', at: scene(placed, 'close').start, level: Option.none() },
          {
            sound: 'paper.fold',
            at: cueAt(placed, 'open', 'rise', 'end'),
            level: Option.some(-14),
          },
        ];
        const placements = [...effectsOf(planned, 'leaf'), ...effectsOf(planned, 'crease')];
        expect(placements).toHaveLength(expected.length);
        placements.forEach((e, i) => {
          const want = Option.getOrThrow(Option.fromUndefinedOr(expected[i]));
          const entry = library[want.sound];
          const late = e.at - want.at;
          expect(late).toBeGreaterThanOrEqual(0);
          expect(late).toBeLessThan(JITTER_DELAY);
          expect(Math.abs(e.pitch)).toBeLessThanOrEqual(DEFAULT_JITTER.pitch);
          const level = gainFor(levelOf(entry, want.level), loudnessOf(e.file), 'one-shot');
          const nudge = 20 * Math.log10(e.gain / level);
          expect(Math.abs(nudge)).toBeLessThanOrEqual(DEFAULT_JITTER.gain + 1e-9);
        });
        const [first, second] = effectsOf(planned, 'leaf');
        expect(first?.file).not.toBe(second?.file);
      }),
  );

  it.effect.layer(BunServices.layer)(
    'an unmade generated sound is named once, and the mix plays without it',
    () =>
      Effect.gen(function* () {
        const { placed, manifest } = yield* load();
        const unmade = plan(placed, manifest, {}, generated);
        expect(unmade.warnings).toEqual(
          ['amb.hall', 'paper.page', 'paper.fold'].map(
            (name) => `mix.missing sound=${name} hint="run sfx make ${name}, then sfx keep"`,
          ),
        );
        expect(heard(unmade)).toEqual(heard(plan(placed, manifest, {})));
      }),
  );
});
