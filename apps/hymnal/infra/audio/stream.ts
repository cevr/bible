/**
 * `bun run audio:stream --keys all`: the Warm band in every other key the
 * Key stepper reaches, rendered, checked, uploaded to R2 under
 * `audio/<set>/sdah/<n>.mp3`, read back and deleted, one hymn at a time
 * (`./stream-job.ts`).
 *
 *   bun run audio:stream --keys all                  # the 11 keys, +1, -1, +2, ... +6; hymns 1 to 695
 *   bun run audio:stream --keys 2 --hymns 1,46,663   # those hymns in warm-1-up2
 *   bun run audio:stream --keys all --parallel 2 --load 8
 *
 * Each hymn renders in its own `render.ts` process
 * (`packages/hymnal/scripts/render/`), which waits while the 1-minute load
 * is over `--load` (default 12, render's guard) and keeps its own memory;
 * `--parallel` (default 4) of them run at once. The render cache is
 * `$HYMN_RENDER_CACHE` (default `~/.cache/manna-hymn-render`), and the run's
 * lines also go to its `stream.log`. A rerun resumes: what R2 holds with the
 * record's bytes is kept. Stop it with SIGTERM or Ctrl-C. The run exits
 * non-zero when a hymn failed. It writes with the owner's Alchemy Cloudflare
 * profile, as `./upload.ts` does. The printed key, `warm-1`, is never streamed.
 */
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, Effect, Layer, Option, Path, Result, Schema, Stream } from 'effect';
import { Command, Flag } from 'effect/cli';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { HashBun } from './hash-bun.ts';
import { SDAH_HYMNS } from './plan.ts';
import { TargetR2Writes } from './r2.ts';
import { hymnsOf, keysOf, Renderer, stream, StreamFailed } from './stream-job.ts';

/** The run ended with a hymn failed: its line in the log says why. */
export class StreamIncomplete extends Schema.TaggedError<StreamIncomplete>()('StreamIncomplete', {
  failed: Schema.Finite,
}) {
  override get message() {
    return `audio stream: ${this.failed} hymns failed; their lines in stream.log say why, and a rerun tries them again`;
  }
}

/** `render.ts`, run with Bun from the hymnal package, its output's last 3000 characters kept. */
/** The render cache, as `render.ts` reads it. */
const renderCache = Effect.gen(function* () {
  const path = yield* Path.Path;
  const home = yield* Config.String('HOME');
  return yield* Config.String('HYMN_RENDER_CACHE').pipe(
    Config.withDefault(path.join(home, '.cache', 'manna-hymn-render')),
  );
});

const renderLive = (load: number) =>
  Layer.effect(
    Renderer,
    Effect.gen(function* () {
      const cache = yield* renderCache;
      const spawner = yield* ChildProcessSpawner;
      const path = yield* Path.Path;
      const pkg = path.resolve(import.meta.dir, '../../../../packages/hymnal');
      const script = path.join(pkg, 'scripts/render/render.ts');
      const run = (args: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const child = yield* spawner.spawn(
            ChildProcess.make(process.execPath, [script, ...args], {
              cwd: pkg,
              env: { HYMN_RENDER_CACHE: cache },
              extendEnv: true,
              forceKillAfter: '5 seconds',
            }),
          );
          const [stdout, stderr, code] = yield* Effect.all(
            [
              Stream.mkString(Stream.decodeText(child.stdout)),
              Stream.mkString(Stream.decodeText(child.stderr)),
              child.exitCode,
            ],
            { concurrency: 3 },
          );
          return { code: Number(code), tail: `${stdout}\n${stderr}`.trim().slice(-3000) };
        }).pipe(
          Effect.scoped,
          Effect.mapError((error) => StreamFailed.make({ reason: `render.ts: ${error.message}` })),
        );
      const dirs = (out: string, work: string, transpose: number) => [
        '--transpose',
        String(transpose),
        '--out',
        out,
        '--work',
        work,
      ];
      return Renderer.of({
        render: ({ hymn, transpose, out, work }) =>
          run([
            '--hymns',
            String(hymn),
            ...dirs(out, work, transpose),
            '--load',
            String(load),
            '--skip-manifest',
          ]),
        manifest: ({ transpose, out, work }) =>
          run([...dirs(out, work, transpose), '--manifest-only']),
      });
    }),
  );

const audioStream = Command.make('audio-stream', {
  keys: Flag.String('keys').pipe(
    Flag.withDescription('all (+1, -1, +2, -2, ... +6), or transposes such as 2,-3'),
  ),
  hymns: Flag.String('hymns').pipe(
    Flag.optional,
    Flag.withDescription('Hymn numbers, unpadded and comma-separated (default 1 to 695)'),
  ),
  parallel: Flag.Int('parallel').pipe(
    Flag.withDefault(4),
    Flag.withDescription('Hymns rendered at once'),
  ),
  load: Flag.Finite('load').pipe(
    Flag.withDefault(12),
    Flag.withDescription('The 1-minute load over which a hymn waits to render'),
  ),
}).pipe(
  Command.withDescription(
    'Render the Warm band in the other keys and stream each hymn to R2: render, check, upload, verify, delete',
  ),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const cache = yield* renderCache;
      const keys = keysOf(flags.keys);
      if (Result.isFailure(keys)) return yield* StreamFailed.make({ reason: keys.failure });
      const hymns = Option.match(flags.hymns, {
        onNone: () => Result.succeed(SDAH_HYMNS),
        onSome: hymnsOf,
      });
      if (Result.isFailure(hymns)) return yield* StreamFailed.make({ reason: hymns.failure });
      if (flags.parallel < 1)
        return yield* StreamFailed.make({ reason: `--parallel ${flags.parallel}: at least 1` });
      const { failed } = yield* stream({
        cache,
        keys: keys.success,
        hymns: hymns.success,
        parallel: flags.parallel,
      });
      if (failed > 0) return yield* StreamIncomplete.make({ failed });
    }).pipe(Effect.provide(Layer.mergeAll(HashBun, TargetR2Writes, renderLive(flags.load)))),
  ),
);

Command.run(audioStream, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
