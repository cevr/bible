/**
 * `bun run prebuild:native [one prebuild's flags]`: `one prebuild`, then the
 * SocketPort guard over the iOS SDK bindings it wrote (`./socketport.ts`,
 * onejs/one#991), so a device build from a fresh prebuild compiles.
 *
 * The guard fails the run once One writes no `SocketPort` case outside a
 * simulator guard: the step then has nothing to do and is to be removed.
 * An Android-only prebuild writes no iOS bindings and skips it.
 */
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Match, Path, Stdio } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { type Guard, guardSocketPort } from './socketport.ts';

const androidOnly = (args: ReadonlyArray<string>) =>
  args.includes('--platform=android') ||
  args.some((arg, i) => arg === '--platform' && args[i + 1] === 'android');

/** Writes a guarded table and says what the guard found: 1 once it has nothing to do. */
const report = <E>(found: Guard, write: (source: string) => Effect.Effect<void, E>) =>
  Match.type<Guard>().pipe(
    Match.tagsExhaustive({
      Guarded: ({ source, cases }) =>
        write(source).pipe(
          Effect.andThen(
            Console.log(
              `[hymnal] onejs/one#991: put ${cases} SocketPort cases under a simulator guard`,
            ),
          ),
          Effect.as(0),
        ),
      AlreadyGuarded: ({ cases }) =>
        Console.log(`[hymnal] onejs/one#991: ${cases} SocketPort cases already guarded`).pipe(
          Effect.as(0),
        ),
      Gone: () =>
        Console.error(
          '[hymnal] onejs/one#991: One wrote no SocketPort case outside a simulator guard. ' +
            'The guard has nothing to do: remove vite/socketport.ts and vite/prebuild.ts, ' +
            'and set prebuild:native back to `one prebuild`.',
        ).pipe(Effect.as(1)),
    }),
  )(found);

Effect.gen(function* () {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const args = yield* (yield* Stdio.Stdio).args;
  // vite/ → the app's root.
  const app = path.resolve(import.meta.dir, '..');
  const code = yield* (yield* ChildProcessSpawner).exitCode(
    ChildProcess.make('one', ['prebuild', ...args], {
      cwd: app,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
      forceKillAfter: '5 seconds',
    }),
  );
  if (code !== 0) return code;
  if (androidOnly(args)) return 0;
  const table = path.join(
    app,
    'ios/OneSwiftPackages/OneSDKBindings/Sources/OneSDK_Foundation.swift',
  );
  // No Foundation table at all is One writing no SocketPort case.
  if (!(yield* fs.exists(table))) return yield* report({ _tag: 'Gone' }, () => Effect.void);
  const found = guardSocketPort(yield* fs.readFileString(table));
  return yield* report(found, (source) => fs.writeFileString(table, source));
}).pipe(
  Effect.flatMap((code) =>
    Effect.sync(() => {
      process.exitCode = code;
    }),
  ),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
