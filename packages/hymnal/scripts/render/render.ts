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
 *   bun run render --hymns 46 --transpose 2   # the set warm-1-up2: every note 2 semitones up
 *
 * `--transpose <t>` (-5 to 6) renders the set `warm-1-up<t>` or
 * `warm-1-down<-t>` (`keySet`): every note moved t semitones, a stem that
 * would leave its instrument's samples moved an octave as a whole
 * (`keys.ts`, named on the hymn's line), the ticks and tempo map unchanged.
 * `--skip-manifest` and `--manifest-only` are the stream's
 * (`apps/hymnal/infra/audio/stream.ts`): its parallel renders write no
 * manifest, and at a key's end it writes the manifest alone, a record whose
 * MP3 it uploaded and deleted standing on its record.
 *
 * The cache is `$HYMN_RENDER_CACHE` (default `~/.cache/manna-hymn-render`):
 * the instruments, the sampler's build, and the set
 * (`sets/<set>/`, `sets/warm-1/` for the printed key, unless `--out` names another folder). A run prints one
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
import { creditText, keySet } from '../../src/recordings.js';
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
  transpose: Flag.Int('transpose').pipe(
    Flag.withDefault(0),
    Flag.withDescription(
      'Semitones from the printed key, -5 to 6: the set warm-1-up<t> or warm-1-down<-t>',
    ),
  ),
  skipManifest: Flag.Boolean('skip-manifest').pipe(
    Flag.withDefault(false),
    Flag.withDescription(
      "Write no manifest: the stream's parallel renders, whose manifest it writes at the key's end",
    ),
  ),
  manifestOnly: Flag.Boolean('manifest-only').pipe(
    Flag.withDefault(false),
    Flag.withDescription(
      "Write only a streamed set's manifest: a record whose MP3 the stream uploaded and deleted stands on its record",
    ),
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
      if (flags.transpose < -5 || flags.transpose > 6)
        return yield* RenderFailed.make({
          step: 'arguments',
          reason: `--transpose ${flags.transpose}: the keys run from -5 to 6`,
        });
      const set = keySet(flags.transpose);
      const chosen = flags.manifestOnly ? [] : yield* chosenOf(flags.hymns, flags.all);
      const out = path.resolve(Option.getOrElse(flags.out, () => path.join(cache, 'sets', set)));
      const work = path.resolve(
        Option.getOrElse(flags.work, () => path.join(cache, `work-${set}`)),
      );
      yield* fs.makeDirectory(out, { recursive: true });

      const { text: lockText, lock } = yield* readLock;
      // The manifest renders nothing, so it reads the instruments' lock but not the instruments.
      const fetched = flags.manifestOnly ? 0 : yield* fetchInstruments(cache, lock);
      const sfizz = yield* sfizzBinary(cache);
      const nodeAv = yield* nodeAvVersion;
      const comment = creditText();
      const configHash = yield* configOf(
        STYLE,
        { lock: lockText, sfizzSha256: sfizz.sha256, nodeAv, comment },
        flags.transpose,
      );
      yield* Effect.sync(() =>
        console.log(
          `render set=${set} hymns=${chosen.length} instruments-fetched=${fetched} config=${configHash.slice(0, 12)}`,
        ),
      );
      const setup = {
        style: STYLE,
        transpose: flags.transpose,
        instruments: path.join(cache, 'instruments'),
        sampler: sfizz.binary,
        ir: roomOf(STYLE),
        comment,
        load: flags.load,
        set,
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
      if (flags.skipManifest) {
        if (counts.failed > 0) yield* Effect.sync(() => (process.exitCode = 1));
        return;
      }
      const { manifest, left } = yield* writeManifest(setup, flags.manifestOnly);
      yield* Effect.sync(() => {
        console.log(
          `render set=${set} hymns=${chosen.length} rendered=${counts.passed + counts.failed} kept=${counts.kept} failed=${counts.failed} manifest=${manifest.hymns.length} stale=${left.length}`,
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
