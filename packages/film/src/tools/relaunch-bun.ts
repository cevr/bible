// The host adapter that starts the lab again in its own process: `execve` of
// the command line it was started with (the runtime's own flags, then the
// script and its arguments), keeping its process id and its environment.
// `relaunchOnExportsChange` (`exports-watch.ts`) calls it only once the lab's
// servers, its pages and their Chrome are closed.

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
                execve(process.execPath, [
                  process.execPath,
                  ...process.execArgv,
                  ...process.argv.slice(1),
                ]),
              ),
          }),
        ),
      ).pipe(Effect.andThen(Effect.never)),
  }),
);
