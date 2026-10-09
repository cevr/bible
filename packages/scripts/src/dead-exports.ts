#!/usr/bin/env bun
// The dead-export check: an export of `packages/*/src` that no other module
// of the workspace takes (a module's own use does not count, and neither does
// a test's or a fixture's) is deleted from its module, not kept "in case". A
// package's entries (what its `exports`, `main` and `bin` name) are swept like
// any module: every package is private, so an entry's export has no user
// beyond the workspace. A re-export takes only what its own name's users take,
// and a take counts only from a module the roots reach: the apps, the files a
// bin or a `package.json` script runs, and the few named in `workspace.ts`.
// That leaves a cycle nothing reaches dead. A default export is swept like any
// other.
//
// The exports found before the check existed are the debt
// (`dead-exports/debt.txt`, one `file name` per line): read only by their
// own module's tests, or by nobody. The debt only shrinks: a new dead export
// fails, a debt line whose export has since been used or removed fails, and so
// does a debt line the base revision lacks, so a dead export cannot come in
// with its own line. The base is `DEAD_EXPORTS_BASE` when CI names one (the
// push's pre-push SHA, or the pull request's base SHA), else the merge-base
// with the newer of main and origin/main. With no base to read, it fails; a
// base from before this check existed holds nothing (its adoption).
//
//   bun run dead-exports    # prints `dead-export <file> <name>` per new one,
//                           # `stale-debt <file> <name>` per settled one,
//                           # `grown-debt <line>` per line the base lacks and
//                           # `base-unavailable <why>`; exits 1 on any
//
// Part of `bun run guard`, so CI and the gate run it.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Array as Arr, Config, Console, Effect, FileSystem, Path } from 'effect';

import { debtLines, grownOver } from './dead-exports/base.js';
import { deadExports } from './dead-exports/graph.js';
import { readWorkspace } from './dead-exports/workspace.js';

const main = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dead = deadExports(yield* readWorkspace(path.resolve(import.meta.dir, '../../..')));
  const root = path.resolve(import.meta.dir, '../../..');
  const debtFile = 'packages/scripts/src/dead-exports/debt.txt';
  const debt = debtLines(yield* fs.readFileString(path.join(root, debtFile)));
  // The debt only shrinks: a line the base revision lacks is debt this change grew.
  // CI names the base (the push's pre-push SHA, or the pull request's base SHA).
  const named = yield* Config.option(Config.String('DEAD_EXPORTS_BASE'));
  const base = yield* grownOver(
    root,
    { check: 'packages/scripts/src/dead-exports.ts', debt: debtFile },
    named,
    debt,
  ).pipe(
    Effect.map((grown) => ({ grown, unreadable: false })),
    Effect.catchTag('BaseUnavailable', (e) =>
      Console.log(`base-unavailable ${e.reason}`).pipe(
        Effect.as<{ grown: ReadonlyArray<string>; unreadable: boolean }>({
          grown: [],
          unreadable: true,
        }),
      ),
    ),
  );
  const { grown } = base;
  const fresh = Arr.difference(dead, debt);
  const settled = Arr.difference(debt, dead);
  yield* Effect.forEach(grown, (line) => Console.log(`grown-debt ${line}`), { discard: true });
  yield* Effect.forEach(fresh, (line) => Console.log(`dead-export ${line}`), { discard: true });
  yield* Effect.forEach(settled, (line) => Console.log(`stale-debt ${line}`), { discard: true });
  yield* Console.log(
    `dead-exports debt=${debt.length} new=${fresh.length} settled=${settled.length} grown=${grown.length}`,
  );
  yield* Effect.sync(() => {
    process.exitCode = Number(fresh.length + settled.length + grown.length > 0 || base.unreadable);
  });
});

BunRuntime.runMain(main.pipe(Effect.provide(BunServices.layer)));
