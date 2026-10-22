/**
 * `bun run render`: the hymnal's MIDI files to MP3 recordings in style C,
 * "Warm band" (`style.ts`), each checked (`checks.ts`), into a set outside
 * git that the app's upload sends to R2.
 *
 *   bun run render --hymns 1,46          # those hymns (unpadded numbers)
 *   bun run render --all                 # every hymn, 1 to 695
 *   bun run render --hymns 663 --out DIR --work DIR
 *   bun run render --all --load 16         # wait while the 1-minute load is over 16, not 12
 *   bun run render --lock                # make instruments.lock.json from GitHub's trees
 *
 * The cache is `$HYMN_RENDER_CACHE` (default `~/.cache/manna-hymn-render`):
 * the instruments, the sampler's build, and the set
 * (`sets/warm-1/` unless `--out` names another folder). A run prints one
 * line a hymn and a last summary line, writes the set's `manifest.json`, and
 * exits non-zero when any hymn failed. A rerun renders only what failed or
 * whose sound changed, and checks the rest again from their records
 * (`run.ts`); the summary's `stale` counts records left out of the manifest
 * because they were rendered under another config. The set is rendered on this Mac only: another host's
 * sampler and FFmpeg give other bytes.
 */

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { creditText, RECORDING_SET } from '../../src/recordings.js';
import { chosenOf } from './hymns.js';
import { fetchInstruments, lockInstruments, readLock } from './instruments.js';
import { RenderFailed } from './proc.js';
import { configOf, GUARDS, renderHymn, roomOf, writeManifest } from './run.js';
import { sfizzBinary } from './sfizz.js';
import { STYLE } from './style.js';

/** NodeAV's package.json, by the two fields the version is read from. */
const NodeAvPackage = Schema.fromJsonString(
  Schema.Struct({ name: Schema.Literal('node-av'), version: Schema.String }),
);

/** NodeAV's version, from its package.json beside the module Bun resolves. */
const nodeAvVersion = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let dir = path.dirname(Bun.resolveSync('node-av', import.meta.dir));
  for (;;) {
    const file = path.join(dir, 'package.json');
    if (yield* fs.exists(file)) {
      const pkg = yield* Schema.decodeEffect(NodeAvPackage)(yield* fs.readFileString(file)).pipe(
        Effect.option,
      );
      if (Option.isSome(pkg)) return pkg.value.version;
    }
    const up = path.dirname(dir);
    if (up === dir)
      return yield* RenderFailed.make({ step: 'node-av', reason: 'no package.json found' });
    dir = up;
  }
});

const render = Command.make('render', {
  hymns: Flag.String('hymns').pipe(
    Flag.optional,
    Flag.withDescription('Hymn numbers to render, unpadded and comma-separated'),
  ),
  all: Flag.Boolean('all').pipe(Flag.withDefault(false), Flag.withDescription('Every hymn')),
  out: Flag.String('out').pipe(Flag.optional, Flag.withDescription('The set folder')),
  work: Flag.String('work').pipe(Flag.optional, Flag.withDescription('The scratch folder')),
  load: Flag.Finite('load').pipe(
    Flag.withDefault(GUARDS.load),
    Flag.withDescription('The 1-minute load over which a hymn waits to render'),
  ),
  lock: Flag.Boolean('lock').pipe(
    Flag.withDefault(false),
    Flag.withDescription("Make instruments.lock.json from the repositories' trees"),
  ),
}).pipe(
  Command.withDescription('Render the hymnal MIDI files to checked MP3 recordings'),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* Config.String('HOME');
      const cache = yield* Config.String('HYMN_RENDER_CACHE').pipe(
        Config.withDefault(path.join(home, '.cache', 'manna-hymn-render')),
      );
      if (flags.lock) {
        const files = yield* lockInstruments(cache);
        yield* Effect.sync(() => console.log(`render lock files=${files}`));
        return;
      }
      const chosen = yield* chosenOf(flags.hymns, flags.all);
      const out = path.resolve(
        Option.getOrElse(flags.out, () => path.join(cache, 'sets', RECORDING_SET)),
      );
      const work = path.resolve(
        Option.getOrElse(flags.work, () => path.join(cache, `work-${RECORDING_SET}`)),
      );
      yield* fs.makeDirectory(out, { recursive: true });

      const { text: lockText, lock } = yield* readLock;
      const fetched = yield* fetchInstruments(cache, lock);
      const sfizz = yield* sfizzBinary(cache);
      const nodeAv = yield* nodeAvVersion;
      const comment = creditText();
      const configHash = yield* configOf(STYLE, {
        lock: lockText,
        sfizzSha256: sfizz.sha256,
        nodeAv,
        comment,
      });
      yield* Effect.sync(() =>
        console.log(
          `render set=${RECORDING_SET} hymns=${chosen.length} instruments-fetched=${fetched} config=${configHash.slice(0, 12)}`,
        ),
      );
      const setup = {
        style: STYLE,
        instruments: path.join(cache, 'instruments'),
        sampler: sfizz.binary,
        ir: roomOf(STYLE),
        comment,
        load: flags.load,
        set: RECORDING_SET,
        out,
        work,
        sfizzSha256: sfizz.sha256,
        nodeAv,
        configHash,
      };
      const counts = { kept: 0, passed: 0, failed: 0 };
      for (const hymn of chosen) {
        const outcome = yield* renderHymn(setup, hymn).pipe(
          Effect.catchTag('RenderFailed', (error) =>
            error.step === 'disk'
              ? Effect.fail(error)
              : Effect.succeed({
                  hymn,
                  status: 'failed' as const,
                  line: `${hymn} FAIL ${error.message}`,
                }),
          ),
        );
        counts[outcome.status]++;
        yield* Effect.sync(() => console.log(outcome.line));
      }
      const { manifest, left } = yield* writeManifest(setup);
      yield* Effect.sync(() => {
        console.log(
          `render set=${RECORDING_SET} hymns=${chosen.length} rendered=${counts.passed + counts.failed} kept=${counts.kept} failed=${counts.failed} manifest=${manifest.hymns.length} stale=${left.length}`,
        );
        if (counts.failed > 0) process.exitCode = 1;
      });
    }),
  ),
);

Command.run(render, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
