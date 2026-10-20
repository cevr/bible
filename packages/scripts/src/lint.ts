#!/usr/bin/env bun
// `bun run lint`'s oxlint leg: oxlint over the gate's files (`guard/files.ts`:
// what git tracks, and new files inside a workspace), past the lint config's
// ignore patterns, in parts side by side (`guard/parts.ts`), each part a
// process with its share of the cores. Every argument is oxlint's, given to
// each part before its files:
//
//   bun packages/scripts/src/lint.ts --report-unused-disable-directives-severity=error
//   bun packages/scripts/src/lint.ts --fix
//
// Exits with the highest code a part answered.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Path, Stdio } from 'effect';
import { availableParallelism } from 'node:os';

import { gateFiles, lintIgnored } from './guard/files.js';
import { partsOf, runParts, shareOf, sizesOf } from './guard/parts.js';

/** The files oxlint lints, by extension. */
const LINTED = /\.[cm]?[jt]sx?$/;

Effect.gen(function* () {
  const path = yield* Path.Path;
  // packages/scripts/src → the repo root.
  const root = path.resolve(import.meta.dir, '..', '..', '..');
  const ignored = yield* lintIgnored(root);
  const files = (yield* gateFiles(root)).filter((file) => LINTED.test(file) && !ignored(file));
  const passed = yield* (yield* Stdio.Stdio).args;
  const share = shareOf(availableParallelism());
  const parts = partsOf(yield* sizesOf(root, files), share.parts);
  const code = yield* runParts(
    root,
    'node_modules/.bin/oxlint',
    [`--threads=${share.threads}`, ...passed],
    parts,
  );
  yield* Effect.sync(() => {
    process.exitCode = code;
  });
}).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
