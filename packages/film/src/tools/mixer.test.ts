// Mixer with fakes: the track and its master are replaced together, only by a
// mix that finishes. A failed or interrupted mix leaves the previous pair and
// no partial file behind. No ffmpeg.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, Layer, Stream } from 'effect';
import { FfmpegFailed } from './errors.ts';
import { Ffmpeg } from './ffmpeg.ts';
import { FilmRepo } from './film-repo.ts';
import { Mixer } from './mixer.ts';
import { memoryFileSystem, testFilm, text } from './testing.ts';

const film = testFilm([{ id: 'a', min: 5 }], { voice: '', scenes: {} });
const TRACK = '/films/test/narration/full.mp3';
const MASTER = '/films/test/narration/full.wav';

type Finish = 'done' | 'fail' | 'hang';

/** An ffmpeg that writes every narration output the mix names, then finishes, fails or hangs. */
const writingFfmpeg = (files: Map<string, Uint8Array>, finish: Finish) =>
  Layer.succeed(
    Ffmpeg,
    Ffmpeg.of({
      run: (args) =>
        Effect.gen(function* () {
          for (const [i, arg] of args.entries())
            if (args[i - 1] !== '-i' && arg.startsWith('/films/test/narration/full'))
              files.set(arg, text('new'));
          if (finish === 'fail')
            return yield* FfmpegFailed.make({ tool: 'ffmpeg', exitCode: 1, stderr: 'no space' });
          if (finish === 'hang') return yield* Effect.never;
        }),
      version: Effect.void,
      probeDuration: () => Effect.succeed(5),
      probeStreams: () => Effect.succeed(['audio']),
      encode: (_args, input) => Stream.runDrain(input),
    }),
  );

const setup = (finish: Finish) => {
  const files = new Map<string, Uint8Array>([
    [TRACK, text('old')],
    [MASTER, text('old')],
  ]);
  const repo = Layer.succeed(
    FilmRepo,
    FilmRepo.of({ paths: () => film.paths, load: () => Effect.succeed(film) }),
  );
  const layer = Mixer.layer.pipe(
    Layer.provide([memoryFileSystem(files), repo, writingFfmpeg(files, finish)]),
  );
  const mix = Effect.gen(function* () {
    yield* (yield* Mixer).mix('test', { stems: false });
  }).pipe(Effect.provide(layer));
  const read = (file: string) => new TextDecoder().decode(files.get(file));
  const partials = () => [...files.keys()].filter((f) => f.includes('partial'));
  return { mix, read, partials };
};

describe('Mixer', () => {
  it.effect('a finished mix replaces the track and the master', () =>
    Effect.gen(function* () {
      const { mix, read, partials } = setup('done');
      yield* mix;
      expect([read(TRACK), read(MASTER)]).toEqual(['new', 'new']);
      expect(partials()).toEqual([]);
    }),
  );

  it.effect('a failed mix leaves the previous track and master', () =>
    Effect.gen(function* () {
      const { mix, read, partials } = setup('fail');
      const error = yield* Effect.flip(mix);
      expect(error._tag).toBe('FfmpegFailed');
      expect([read(TRACK), read(MASTER)]).toEqual(['old', 'old']);
      expect(partials()).toEqual([]);
    }),
  );

  it.live('an interrupted mix leaves the previous track and master', () =>
    Effect.gen(function* () {
      const { mix, read, partials } = setup('hang');
      const fiber = yield* Effect.forkChild(mix);
      yield* Effect.sleep('10 millis');
      yield* Fiber.interrupt(fiber);
      expect([read(TRACK), read(MASTER)]).toEqual(['old', 'old']);
      expect(partials()).toEqual([]);
    }),
  );
});
