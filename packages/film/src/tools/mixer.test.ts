// Mixer with fakes: the track is replaced only by a mix that finishes; a
// failed or interrupted mix leaves the previous track and no partial file
// behind. A sound at another rate fails the mix rather than being resampled.

import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Fiber, Layer, Option, Path, Result, Schedule, Schema } from 'effect';
import { silence } from '../core/audio.ts';
import { filmEnd, layout } from '../core/layout.ts';
import { MIX_RATE, mixKey } from '../core/mix.ts';
import { hashText, voiceKey } from '../core/narration.ts';
import type { Timed, Timings } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { MediaFailed } from './errors.ts';
import { FilmRepo } from './film-repo.ts';
import { Media } from './media.ts';
import { MasterStampJson, Mixer, planOf, stampManifest } from './mixer.ts';
import { NO_SCORES } from './media-store.ts';
import { memoryFileSystem, noRecording, testFilm, testVoice, text } from './testing.ts';

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
      duration: () => Effect.succeed(5),
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

const setup = (finish: Finish, rate = MIX_RATE) => {
  const files = new Map<string, Uint8Array>([[TRACK, text('old')]]);
  const decoded: Array<string> = [];
  const hung = Deferred.makeUnsafe<void>();
  const repo = Layer.succeed(
    FilmRepo,
    FilmRepo.of({
      load: () => Effect.succeed(film),
      script: () => Effect.succeedNone,
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
  const store = ContentStore.layer.pipe(Layer.provide([fs, Path.layer]));
  const layer = Mixer.layer.pipe(Layer.provideMerge(store), Layer.provide([fs, repo, media]));
  /** `effect` with one mixer and one store, sharing their locks. */
  const run = <A, E>(effect: Effect.Effect<A, E, Mixer | ContentStore>) =>
    effect.pipe(Effect.provide(layer));
  const mixing = (stems = false) =>
    Effect.gen(function* () {
      yield* (yield* Mixer).mix('test', { stems, score: Option.none() });
    });
  const mix = (stems = false) => run(mixing(stems));
  const read = (file: string) => new TextDecoder().decode(files.get(file));
  const partials = () => [...files.keys()].filter((f) => f.includes('partial'));
  return { files, decoded, hung, mix, mixing, run, read, partials };
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
        take: Option.none(),
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
