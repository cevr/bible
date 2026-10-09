#!/usr/bin/env bun
// The dead-export check: an export of `packages/*/src` that no other module
// of the workspace takes (a module's own use does not count, and neither does
// a test's or a fixture's) is deleted from its module, not kept "in case". A
// package's public entries (what its `exports`, `main` and `bin` name) are
// the one place exports stand for users beyond the workspace, so they are
// not swept. A default export is its loader's.
//
// The exports found before the check existed are the debt
// (`dead-exports/debt.txt`, one `file name` per line): read only by their
// own module's tests, or by nobody. The debt only shrinks. A new dead export
// fails, and so does a debt line whose export has since been used or removed.
//
//   bun run dead-exports    # prints `dead-export <file> <name>` per new one and
//                           # `stale-debt <file> <name>` per settled one; exits 1 on any
//
// Part of `bun run guard`, so CI and the gate run it.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Array as Arr, Console, Effect, FileSystem, Path } from 'effect';

import { deadExports } from './dead-exports/graph.js';
import { readWorkspace } from './dead-exports/workspace.js';

const main = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dead = deadExports(yield* readWorkspace(path.resolve(import.meta.dir, '../../..')));
  const debt = Arr.filter(
    (yield* fs.readFileString(path.join(import.meta.dir, 'dead-exports/debt.txt'))).split('\n'),
    (line) => line !== '',
  );
  const fresh = Arr.difference(dead, debt);
  const settled = Arr.difference(debt, dead);
  yield* Effect.forEach(fresh, (line) => Console.log(`dead-export ${line}`), { discard: true });
  yield* Effect.forEach(settled, (line) => Console.log(`stale-debt ${line}`), { discard: true });
  yield* Console.log(
    `dead-exports debt=${debt.length} new=${fresh.length} settled=${settled.length}`,
  );
  yield* Effect.sync(() => {
    process.exitCode = Number(fresh.length + settled.length > 0);
  });
});

BunRuntime.runMain(main.pipe(Effect.provide(BunServices.layer)));
