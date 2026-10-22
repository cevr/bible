// Mixer with fakes: the track is replaced only by a mix that finishes; a
// failed or interrupted mix leaves the previous track and no partial file
// behind. A sound at another rate fails the mix rather than being resampled.
// One variant heard in its sound's place (a take by its sha256, a seed by its
// source's label) plays at every placement of that sound.

import { describe, expect, it } from 'effect-bun-test';
import {
  Deferred,
  Effect,
  Fiber,
  type FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Schedule,
  Schema,
} from 'effect';
import { silence } from '../core/audio.ts';
import { filmEnd, layout } from '../core/layout.ts';
import { MIX_RATE, mixKey } from '../core/mix.ts';
import {
  type DerivedSource,
  type Playable,
  type Variant,
  defineLibrary,
  derivedPlayable,
  measurePcm,
  renderSource,
  requestKey,
  seedSources,
  sourceLabel,
  trialSources,
  variantPlayable,
} from '../core/sfx.ts';
import { measuredSounds } from '../core/testing.ts';
import { hashText, voiceKey } from '../core/narration.ts';
import type { Timed, Timings } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { MediaFailed } from '../core/refusals.ts';
import { FilmRepo, type LoadedFilm, type MeasuredFilm } from './film-repo.ts';
import { Media } from './media.ts';
import { MasterStampJson, Mixer, planKey, planOf, stampManifest } from './mixer.ts';
import { NO_SCORES } from './media-store.ts';
import { SoundRender } from './sound-render.ts';
import {
  memoryFileSystem,
  memoryLocks,
  noRecording,
  testFilm,
  testVoice,
  text,
} from './testing.ts';

const scenes: ReadonlyArray<Timed> = [{ id: 'a', say: 'Hello.', min: 5 }];
const timings: Timings = {
  voice: voiceKey(testVoice),
  scenes: {
    a: { hash: hashText('Hello.'), file: 'a.mp3', duration: 1, words: [], source: 'elevenlabs' },
  },
};
const film = testFilm(scenes, timings);
const TRACK = '/films/test/narration/full.wav';
const STAMP = '/films/test/narration/full.json';
const TAKE = '/films/test/narration/a.mp3';

type Finish = 'done' | 'fail' | 'hang';

/**
 * Media whose sounds decode to a second of silence at `rate`, and whose WAV
 * writes land, then finish, fail or hang (completing `hung` as they do).
 */
const writingMedia = (
  files: Map<string, Uint8Array>,
  finish: Finish,
  rate: number,
  hung: Deferred.Deferred<void>,
) =>
  Layer.succeed(
    Media,
    Media.of({
      ...noRecording,
      timing: () => Effect.succeed({ seconds: 5, fps: Option.none() }),
      decode: () => Effect.succeed(silence(rate, rate, 1)),
      encodeAac: () => Effect.succeed({ packets: [], meta: {} }),
      writeWav: (file, pcm) =>
        Effect.gen(function* () {
          files.set(file, text(`wav ${pcm.frames}`));
          if (finish === 'fail')
            return yield* MediaFailed.make({ op: 'write', file, reason: 'no space' });
          if (finish === 'hang') {
            yield* Deferred.complete(hung, Effect.void);
            return yield* Effect.never;
          }
        }),
      join: () => Effect.void,
      shareCopy: () => Effect.void,
    }),
  );

const setup = (
  finish: Finish,
  rate = MIX_RATE,
  loaded: LoadedFilm = film,
  render: Layer.Layer<SoundRender> = SoundRender.layer,
) => {
  const files = new Map<string, Uint8Array>([[TRACK, text('old')]]);
  const decoded: Array<string> = [];
  const hung = Deferred.makeUnsafe<void>();
  const repo = Layer.succeed(
    FilmRepo,
    FilmRepo.of({
      load: () => Effect.succeed(loaded),
      script: () => Effect.succeedNone,
      sound: () => Effect.succeed(loaded.sound),
      scores: Effect.succeed(NO_SCORES),
    }),
  );
  const media = Layer.effect(
    Media,
    Effect.gen(function* () {
      const inner = yield* Media;
      return Media.of({
        ...inner,
        decode: (file) =>
          inner.decode(file).pipe(Effect.tap(() => Effect.sync(() => void decoded.push(file)))),
      });
    }),
  ).pipe(Layer.provide(writingMedia(files, finish, rate, hung)));
  const fs = memoryFileSystem(files);
  const store = ContentStore.layer.pipe(Layer.provide([fs, Path.layer, memoryLocks]));
  const layer = Mixer.layer.pipe(
    Layer.provideMerge(store),
    Layer.provide([fs, repo, media, render]),
  );
  /** `effect` with one mixer and one store, sharing their locks. */
  const run = <A, E>(effect: Effect.Effect<A, E, Mixer | ContentStore>) =>
    effect.pipe(Effect.provide(layer));
  /** `effect` over the same files and renderer as the mixer's. */
  const beside = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | SoundRender>) =>
    effect.pipe(Effect.provide([fs, render]));
  const mixing = (stems = false) =>
    Effect.gen(function* () {
      yield* (yield* Mixer).mix('test', { stems, score: Option.none() });
    });
  const mix = (stems = false) => run(mixing(stems));
  const read = (file: string) => new TextDecoder().decode(files.get(file));
  const partials = () => [...files.keys()].filter((f) => f.includes('partial'));
  return { files, decoded, hung, mix, mixing, run, beside, read, partials };
};

/** The film's length in frames: every track is exactly that long. */
const frames = Math.round(filmEnd(Result.getOrThrow(layout(scenes, timings))) * MIX_RATE);

describe('Mixer', () => {
  it.effect('a finished mix replaces the track with one the film’s length', () =>
    Effect.gen(function* () {
      const { decoded, mix, read, partials } = setup('done');
      yield* mix();
      expect(decoded).toEqual([TAKE]);
      expect(read(TRACK)).toBe(`wav ${frames}`);
      expect(partials()).toEqual([]);
    }),
  );

  it.effect('beside the track, the mix stamps the key of the plan it played: the film’s now', () =>
    Effect.gen(function* () {
      const { mix, read } = setup('done');
      yield* mix();
      const stamp = yield* Schema.decodeEffect(MasterStampJson)(read(STAMP));
      // The film has no score or library sound to be missing: its plan is the one `mix` played.
      const now = planOf(film, Result.getOrThrow(layout(scenes, timings)), {
        score: Option.none(),
        inPlace: Option.none(),
      });
      expect(stamp.key).toBe(mixKey(Result.getOrThrow(now)));
    }),
  );

  it.effect('with stems, each bus is written beside the render', () =>
    Effect.gen(function* () {
      const { files, mix, read } = setup('done');
      yield* mix(true);
      expect([...files.keys()].filter((f) => f.startsWith('/out/test/stems/'))).toEqual([
        '/out/test/stems/voice.wav',
      ]);
      expect(read('/out/test/stems/voice.wav')).toBe(`wav ${frames}`);
    }),
  );

  it.effect('a failed mix leaves the previous track', () =>
    Effect.gen(function* () {
      const { files, mix, read, partials } = setup('fail');
      const error = yield* Effect.flip(mix());
      expect(error._tag).toBe('MediaFailed');
      expect(read(TRACK)).toBe('old');
      expect(files.has(STAMP)).toBe(false);
      expect(partials()).toEqual([]);
    }),
  );

  it.live('an interrupted mix leaves the previous track', () =>
    Effect.gen(function* () {
      const { hung, mix, read, partials } = setup('hang');
      const fiber = yield* Effect.forkChild(mix());
      // Interrupted while the track is being written, as a Ctrl-C mid-mix is.
      yield* Deferred.await(hung);
      yield* Fiber.interrupt(fiber);
      expect(read(TRACK)).toBe('old');
      expect(partials()).toEqual([]);
    }),
  );

  it.live("a mix lands its track and its stamp together, under the stamp's lock", () =>
    Effect.gen(function* () {
      const { mixing, run, read, partials } = setup('done');
      const release = yield* Deferred.make<boolean>();
      const held = yield* Deferred.make<boolean>();
      const whileHeld = yield* run(
        Effect.gen(function* () {
          // Another writer (a mix of another plan) holds the stamp's lock.
          const other = yield* Effect.forkChild(
            (yield* ContentStore).transact(stampManifest(film.paths), () =>
              Deferred.succeed(held, true).pipe(
                Effect.andThen(Deferred.await(release)),
                Effect.as(['held', 'another plan'] as const),
              ),
            ),
          );
          yield* Deferred.await(held);
          const fiber = yield* Effect.forkChild(mixing());
          // The mix has written its track beside the old one, and waits for the lock.
          yield* Effect.sync(() => partials().length).pipe(
            Effect.repeat({ until: (n) => n === 1, schedule: Schedule.spaced('5 millis') }),
            Effect.timeout('10 seconds'),
          );
          const seen = { track: read(TRACK), stamp: read(STAMP), partials: partials().length };
          yield* Deferred.succeed(release, true);
          yield* Fiber.join(other);
          yield* Fiber.join(fiber);
          return seen;
        }),
      );
      // Nothing of the mix landed while the other writer held the lock.
      expect(whileHeld).toEqual({ track: 'old', stamp: '', partials: 1 });
      // Then its track and its own stamp landed together.
      const stamp = yield* Schema.decodeEffect(MasterStampJson)(read(STAMP));
      expect(stamp.key).toMatch(/./);
      expect(read(TRACK)).toBe(`wav ${frames}`);
      expect(partials()).toEqual([]);
    }),
  );

  it.effect('a sound at another rate fails the mix, which never resamples', () =>
    Effect.gen(function* () {
      const { mix, read } = setup('done', 48000);
      const error = yield* Effect.flip(mix());
      expect(error).toEqual(
        expect.objectContaining({ _tag: 'SampleRateMismatch', file: TAKE, rate: 48000 }),
      );
      expect(read(TRACK)).toBe('old');
    }),
  );
});

describe('Mixer: one variant in its sound’s place', () => {
  const TICK = { play: { _tag: 'Partials', pitch: 'E5', set: 'glass', secs: 0.1 } } as const;
  const library = defineLibrary({
    'tone.tick': { kind: 'code', sound: TICK, variants: 2, use: 'one-shot' },
    'tone.chime': {
      kind: 'generated',
      prompt: 'a chime',
      why: 'a test sound',
      secs: 1,
      use: 'one-shot',
      code: { sound: TICK, variants: 2 },
    },
  });
  const take = (sha256: string): Variant => ({
    request: requestKey(library['tone.chime']),
    file: `files/${sha256}.flac`,
    sha256,
    made: '2026-09-30T00:00:00Z',
    model: 'eleven_text_to_sound_v2',
    format: 'pcm_44100',
    secs: 1,
    loudness: { integrated: -24, momentaryMax: -20, peak: -3 },
    licence: 'elevenlabs-paid-sfx',
    credits: 40,
  });
  const [KEPT, WAITING] = [take('kept'), take('waiting')];
  const sounds = measuredSounds(
    library,
    { 'tone.chime': { variants: [KEPT], candidates: [WAITING], rejected: [] } },
    '/lib',
  );
  const twice = [
    { scene: 'a', at: 'start' },
    { scene: 'a', at: 'start', offset: 2 },
  ] as const;
  const placing: MeasuredFilm = {
    ...film,
    sound: Option.some({
      effects: {
        tick: { sound: 'tone.tick', at: twice },
        chime: { sound: 'tone.chime', at: twice },
      },
    }),
    sounds,
  };
  const placed = Result.getOrThrow(layout(scenes, timings));
  /** The key of the film's plan with `playable` at every placement of `sound`, none for its own. */
  const keyWith = (inPlace: Option.Option<{ sound: string; playable: Playable }>) =>
    mixKey(Result.getOrThrow(planOf(placing, placed, { score: Option.none(), inPlace })));
  /** `source` as it plays, measured as the mix measures a seed. */
  const measured = (source: DerivedSource) =>
    derivedPlayable(source, measurePcm(renderSource(source)));
  /** The film rendered with `take` heard in `sound`'s place, its takes' files on disk. */
  const rendered = (sound: string, take: string) => {
    const { files, run } = setup('done', MIX_RATE, placing);
    for (const v of [KEPT, WAITING]) files.set(`/lib/${v.file}`, text(v.sha256));
    return run(
      Mixer.use((mixer) =>
        mixer.render('test', {
          warn: false,
          score: Option.none(),
          take: Option.some({ sound, take }),
        }),
      ),
    );
  };

  it.effect('a waiting take, by its sha256, plays at every placement of its sound', () =>
    Effect.gen(function* () {
      const { key } = yield* rendered('tone.chime', WAITING.sha256);
      const sound = 'tone.chime';
      expect(key).toBe(keyWith(Option.some({ sound, playable: variantPlayable(sounds, WAITING) })));
      expect(key).not.toBe(keyWith(Option.none()));
    }),
  );

  it.effect("a code sound's seed, by its label, in place of the seeds it plays", () =>
    Effect.gen(function* () {
      const [first, second] = seedSources(sounds, 'tone.tick', library['tone.tick']);
      const { key } = yield* rendered('tone.tick', sourceLabel(second!));
      expect(key).toBe(keyWith(Option.some({ sound: 'tone.tick', playable: measured(second!) })));
      expect(key).not.toBe(
        keyWith(Option.some({ sound: 'tone.tick', playable: measured(first!) })),
      );
    }),
  );

  it.effect("a code trial's seed, by its label, where its generated sound plays", () =>
    Effect.gen(function* () {
      const [first] = trialSources(sounds, 'tone.chime');
      const { key } = yield* rendered('tone.chime', sourceLabel(first!));
      expect(key).toBe(keyWith(Option.some({ sound: 'tone.chime', playable: measured(first!) })));
    }),
  );

  /** The renderer, counting each seed it is asked to measure by its source's label. */
  const counting = (counts: Map<string, number>) =>
    Layer.effect(
      SoundRender,
      Effect.gen(function* () {
        const inner = yield* SoundRender;
        const count = (label: string) => void counts.set(label, (counts.get(label) ?? 0) + 1);
        return SoundRender.of({
          ...inner,
          measure: (source) =>
            Effect.tap(inner.measure(source), () => Effect.sync(() => count(sourceLabel(source)))),
          measured: (given, names) =>
            Effect.tap(inner.measured(given, names), (heard) =>
              Effect.sync(() => [...heard.measured.keys()].forEach(count)),
            ),
        });
      }),
    ).pipe(Layer.provide(SoundRender.layer));
  /** The film as its loader gives it: the library resolved, no seed measured. */
  const unmeasured: LoadedFilm = {
    ...placing,
    sounds: {
      library: sounds.library,
      lock: sounds.lock,
      dir: sounds.dir,
      code: sounds.code,
      trials: sounds.trials,
    },
  };
  /** A mix of the unmeasured film, its takes' files on disk, its renderer counting into `counts`. */
  const mixedFrom = (counts: Map<string, number>) => {
    const fixture = setup('done', MIX_RATE, unmeasured, counting(counts));
    for (const v of [KEPT, WAITING]) fixture.files.set(`/lib/${v.file}`, text(v.sha256));
    return fixture;
  };

  it.effect('one mix measures each seed of the code sounds it places once, and plays them', () =>
    Effect.gen(function* () {
      const counts = new Map<string, number>();
      const { mix, read } = mixedFrom(counts);
      yield* mix();
      const seeds = seedSources(sounds, 'tone.tick', library['tone.tick']).map(sourceLabel);
      expect(Object.fromEntries(counts)).toEqual(Object.fromEntries(seeds.map((s) => [s, 1])));
      const stamp = yield* Schema.decodeEffect(MasterStampJson)(read(STAMP));
      expect(stamp.key).toBe(keyWith(Option.none()));
    }),
  );

  it.effect(
    "the plan's key the check reads is the one the mix stamps, from the same loaded film",
    () =>
      Effect.gen(function* () {
        const { mix, read, beside } = mixedFrom(new Map());
        yield* mix();
        const stamp = yield* Schema.decodeEffect(MasterStampJson)(read(STAMP));
        expect(yield* beside(planKey(unmeasured, placed))).toEqual(Option.some(stamp.key));
      }),
  );

  it.effect('a variant its sound has not is refused, and nothing is mixed', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(rendered('tone.chime', 'nosuch'));
      expect(error).toMatchObject({ _tag: 'TakeUnknown', sound: 'tone.chime', take: 'nosuch' });
    }),
  );
});
