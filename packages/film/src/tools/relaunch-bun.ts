// The host adapter that starts the lab again in its own process: `execve` of
// the command line it was started with, keeping its process id and its
// environment. The exports watch (`exports-watch.ts`) ends the lab's scope
// first, so its servers and the easel's Chrome are closed before it runs.

import { Effect, Layer, Option } from 'effect';
import { Relaunch } from './exports-watch.ts';

export const RelaunchBun = Layer.succeed(
  Relaunch,
  Relaunch.of({
    relaunch: (why) =>
      Effect.andThen(
        Effect.log(`[lab] relaunch why="${why}"`),
        Effect.suspend(() =>
          Option.match(Option.fromUndefinedOr(process.execve), {
            onNone: () => Effect.die('this runtime cannot start itself again (no execve)'),
            // The environment is the process's own: execve keeps it when none is given.
            onSome: (execve) =>
              Effect.sync(() =>
                execve(process.execPath, [process.execPath, ...process.argv.slice(1)]),
              ),
          }),
        ),
      ).pipe(Effect.andThen(Effect.never)),
  }),
);
