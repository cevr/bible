#!/usr/bin/env bun
// Every TypeScript file under packages/scripts is in the scripts tsconfig's
// program and is not a declaration file, so `tsc --noEmit` reports its errors.
// Asks tsc for the program's files (`--listFilesOnly`), names each TypeScript
// file of the package outside it (installed packages aside) and each
// declaration file, by TypeScript's rule (`skipLibCheck` hides its errors), and
// exits 1 when there is one. The package's `typecheck` runs it after tsc, so
// the gate holds it.
//
//   bun src/typecheck-coverage.ts

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Path } from 'effect';

import { check } from './typecheck-coverage/check.js';

Effect.gen(function* () {
  const path = yield* Path.Path;
  return yield* check(path.resolve(import.meta.dir, '..'));
}).pipe(
  Effect.tapError((error) => {
    if (error._tag !== 'ListFailed' && error._tag !== 'Uncovered' && error._tag !== 'Unchecked') {
      return Effect.void;
    }
    return Console.error(error.message);
  }),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
