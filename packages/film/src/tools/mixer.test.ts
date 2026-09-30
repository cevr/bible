// Mixer with fakes: the track is replaced only by a mix that finishes; a
// failed or interrupted mix leaves the previous track and no partial file
// behind. A sound at another rate fails the mix rather than being resampled.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, Layer, Option, Result, Schema } from 'effect';
import { silence } from '../core/audio.ts';
import { layout } from '../core/layout.ts';
import { MIX_RATE, mixKey } from '../core/mix.ts';
import { hashText, voiceKey } from '../core/narration.ts';
import type { Timed, Timings } from '../core/schema.ts';
import { filmEnd } from '../core/sound.ts';
import { MediaFailed } from './errors.ts';
import { FilmRepo } from './film-repo.ts';
import { Media } from './media.ts';
import { MasterStampJson, Mixer, planOf } from './mixer.ts';
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

/** Media whose sounds decode to a second of silence at `rate`, and whose WAV writes land, then finish, fail or hang. */
const writingMedia = (files: Map<string, Uint8Array>, finish: Finish, rate: number) =>
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
          if (finish === 'hang') return yield* Effect.never;
        }),
      join: () => Effect.void,
      shareCopy: () => Effect.void,
    }),
  );

const setup = (finish: Finish, rate = MIX_RATE) => {
  const files = new Map<string, Uint8Array>([[TRACK, text('old')]]);
  const decoded: Array<string> = [];
  const repo = Layer.succeed(
    FilmRepo,
    FilmRepo.of({
      paths: () => film.paths,
      load: () => Effect.succeed(film),
      script: () => Effect.succeedNone,
      scores: Effect.succeed(NO_SCORES),
      names: Effect.succeed([]),
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
  ).pipe(Layer.provide(writingMedia(files, finish, rate)));
  const layer = Mixer.layer.pipe(Layer.provide([memoryFileSystem(files), repo, media]));
  const mix = (stems = false) =>
    Effect.gen(function* () {
      yield* (yield* Mixer).mix('test', { stems, score: Option.none() });
    }).pipe(Effect.provide(layer));
  const read = (file: string) => new TextDecoder().decode(files.get(file));
  const partials = () => [...files.keys()].filter((f) => f.includes('partial'));
  return { files, decoded, mix, read, partials };
};

/** The film's length in frames: every track is exactly that long. */
const frames = Math.round(filmEnd(layout(scenes, timings)) * MIX_RATE);

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
      const now = planOf(film, layout(scenes, timings), {
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
      const { mix, read, partials } = setup('hang');
      const fiber = yield* Effect.forkChild(mix());
      yield* Effect.sleep('10 millis');
      yield* Fiber.interrupt(fiber);
      expect(read(TRACK)).toBe('old');
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
