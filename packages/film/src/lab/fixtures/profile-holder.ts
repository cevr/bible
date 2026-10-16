// A process that stands in for a worker's Chrome as an e2e run ends: its
// command line names its profile (`--user-data-dir=<profile>`), it says
// `ready` on stdout once it holds the profile, and asked to end (SIGTERM,
// which interrupts it) it writes into the profile as it shuts down (as
// Chrome writes its `Local State`), making the profile again if it is gone.
// The other process of a test of the run folder's release
// (`run-folder.test.ts`). Its stdin is a pipe from the test, so it ends with
// the test however the test went.

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Effect, FileSystem, Stdio, Stream } from 'effect';

const FLAG = '--user-data-dir=';

Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const stdio = yield* Stdio.Stdio;
  const profile = ((yield* stdio.args).find((arg) => arg.startsWith(FLAG)) ?? '').slice(
    FLAG.length,
  );
  yield* Effect.acquireRelease(Console.log('ready'), () =>
    Effect.orDie(
      Effect.andThen(
        fs.makeDirectory(profile, { recursive: true }),
        fs.writeFileString(`${profile}/Local State`, '{}'),
      ),
    ),
  );
  yield* Stream.runDrain(stdio.stdin);
}).pipe(Effect.scoped, Effect.provide(BunServices.layer), BunRuntime.runMain);
