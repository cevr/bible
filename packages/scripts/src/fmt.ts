#!/usr/bin/env bun
// `bun run fmt` and `bun run fmt:check`: oxfmt over the gate's files
// (`guard/files.ts`: what git tracks, and new files inside a workspace), so a
// folder that is no one's work yet is neither rewritten nor checked. Every
// argument is oxfmt's; oxfmt passes over a file it does not format and one
// its ignore files name.
//
//   bun packages/scripts/src/fmt.ts           # rewrite
//   bun packages/scripts/src/fmt.ts --check   # report, exit 1 on a file to rewrite
// oxfmt formats on all its threads in one process, so it runs as one part.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Path, Stdio } from 'effect';
import { availableParallelism } from 'node:os';

import { gateFiles } from './guard/files.js';
import { runParts } from './guard/parts.js';

Effect.gen(function* () {
  const path = yield* Path.Path;
  // packages/scripts/src → the repo root.
  const root = path.resolve(import.meta.dir, '..', '..', '..');
  const files = yield* gateFiles(root);
  const passed = yield* (yield* Stdio.Stdio).args;
  const code = yield* runParts(
    root,
    'node_modules/.bin/oxfmt',
    [`--threads=${availableParallelism()}`, '--no-error-on-unmatched-pattern', ...passed],
    [files].filter((part) => part.length > 0),
  );
  yield* Effect.sync(() => {
    process.exitCode = code;
  });
}).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
