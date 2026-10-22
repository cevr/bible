#!/usr/bin/env bun
// The gate's lint (`gate.sh`): every deterministic rule over the gate's files
// (`guard/files.ts`), the judged rules left to `bun run lint`, in two oxlints
// side by side (`lint-gate/config.ts` derives their configs):
//
// 1. the native rules alone, over every file, every run;
// 2. the JS plugins' rules (and the native ones beside them), only over the
//    files no earlier run passed at their content now, in parts
//    (`guard/parts.ts`), a part per 64 files up to the machine's share; each
//    file the run passed is kept.
//
// The kept files live in `node_modules/.cache/manna-lint/kept.json`, under a
// key of the derived config, every repository file the JS plugins run (each
// plugin and the modules it imports, `lint-gate/closure.ts`) and `bun.lock`
// (the versions of oxlint, its effect plugin and effect): a change to any of
// them lints every file again. Prints a failing oxlint's report, then one line of
// counts and time; exits with the highest code an oxlint answered.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { JSONC } from 'bun';
import { Clock, Console, Effect, FileSystem, Path, Schema } from 'effect';
import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';

import { gateFiles, lintIgnored } from './guard/files.js';
import { partsOf, runEachPart, shareOf, sizesOf } from './guard/parts.js';
import { importClosure, pluginsOf } from './lint-gate/closure.js';
import {
  Kept,
  LintConfig,
  keptAfter,
  nativeOnly,
  passedOf,
  unkept,
  withoutJudged,
} from './lint-gate/config.js';

/** The files oxlint lints, by extension. */
const LINTED = /\.[cm]?[jt]sx?$/;
/** Where the derived configs and the kept files live, from the root. */
const CACHE = 'node_modules/.cache/manna-lint';
/** The judged plugin as the config names it. */
const JUDGED_PLUGIN = './packages/scripts/lint/judged.ts';
/** Files a part takes before another part pays its JS plugins' load (0.3 s). */
const PER_PART = 64;

const ConfigJson = Schema.fromJsonString(LintConfig);
const KeptJson = Schema.fromJsonString(Kept);

const hashOf = (bytes: Uint8Array | string) => createHash('sha1').update(bytes).digest('hex');

Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const started = yield* Clock.currentTimeMillis;
  // packages/scripts/src → the repo root.
  const root = path.resolve(import.meta.dir, '..', '..', '..');
  const cache = path.join(root, CACHE);
  yield* fs.makeDirectory(cache, { recursive: true });

  const config = yield* Schema.decodeUnknownEffect(LintConfig)(
    JSONC.parse(yield* fs.readFileString(path.join(root, '.oxlintrc.json'))),
  );
  const native = yield* Schema.encodeEffect(ConfigJson)(nativeOnly(config));
  const pluginsConfig = withoutJudged(config, JUDGED_PLUGIN, (plugin) => path.join(root, plugin));
  const plugins = yield* Schema.encodeEffect(ConfigJson)(pluginsConfig);
  const nativeFile = path.join(cache, 'native.json');
  const pluginsFile = path.join(cache, 'plugins.json');
  yield* Effect.all(
    [fs.writeFileString(nativeFile, native), fs.writeFileString(pluginsFile, plugins)],
    { concurrency: 2 },
  );

  const ignored = yield* lintIgnored(root);
  const files = (yield* gateFiles(root)).filter((file) => LINTED.test(file) && !ignored(file));
  const pluginFiles = yield* importClosure(root, pluginsOf(pluginsConfig));
  const keyParts = yield* Effect.forEach(
    [...pluginFiles, 'bun.lock'],
    (file) =>
      Effect.map(fs.readFile(path.join(root, file)), (bytes) => `${file}\0${hashOf(bytes)}`),
    { concurrency: 16 },
  );
  const key = hashOf([plugins, ...keyParts].join('\n'));
  const hashes = new Map(
    yield* Effect.forEach(
      files,
      (file) =>
        Effect.map(fs.readFile(path.join(root, file)), (bytes) => [file, hashOf(bytes)] as const),
      { concurrency: 32 },
    ),
  );
  const keptFile = path.join(cache, 'kept.json');
  const kept = yield* fs.readFileString(keptFile).pipe(
    Effect.flatMap(Schema.decodeEffect(KeptJson)),
    Effect.orElseSucceed((): Kept => ({ key: '', files: {} })),
  );
  const toLint = unkept(kept, key, hashes);

  const cores = availableParallelism();
  const share = shareOf(cores);
  const parts = partsOf(
    yield* sizesOf(root, toLint),
    Math.min(share.parts, Math.ceil(toLint.length / PER_PART)),
  );
  const oxlint = 'node_modules/.bin/oxlint';
  const [nativeRuns, pluginRuns] = yield* Effect.all(
    [
      runEachPart(root, oxlint, ['-c', nativeFile, '--format=unix', `--threads=${cores}`], [files]),
      runEachPart(
        root,
        oxlint,
        [
          '-c',
          pluginsFile,
          '--format=unix',
          `--threads=${share.threads}`,
          '--report-unused-disable-directives-severity=error',
        ],
        parts,
      ),
    ],
    { concurrency: 2 },
  );
  const passed = parts.flatMap((part, at) =>
    pluginRuns.slice(at, at + 1).flatMap((run) => passedOf(part, run.code, run.output)),
  );
  yield* fs.writeFileString(
    keptFile,
    yield* Schema.encodeEffect(KeptJson)(keptAfter(kept, key, hashes, passed)),
  );

  const runs = [...nativeRuns, ...pluginRuns];
  yield* Effect.forEach(
    runs.filter((run) => run.code !== 0),
    (run) => Console.log(run.output.trimEnd()),
    { discard: true },
  );
  const code = Math.max(0, ...runs.map((run) => run.code));
  const ended = yield* Clock.currentTimeMillis;
  yield* Console.log(
    `lint: ${files.length} files, ${toLint.length} through the JS plugins in ${parts.length} parts (${files.length - toLint.length} kept), exit ${code}, ${ended - started} ms`,
  );
  yield* Effect.sync(() => {
    process.exitCode = code;
  });
}).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
