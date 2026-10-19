#!/usr/bin/env bun
// Under packages/scripts, outside `node_modules`, every TypeScript source is in
// the scripts tsconfig's program and no program file is a declaration file,
// each by its real path. Asks tsc for the program's files (`--listFilesOnly`),
// names each source outside the program and each declaration file of the
// package, by TypeScript's rule on tsc's spelling (`skipLibCheck` hides its
// errors), and exits 1 when there is one. A declaration file whose real path
// is outside the package or inside `node_modules` passes, its errors hidden.
// The package's `typecheck` runs it after tsc, so the gate holds it.
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
