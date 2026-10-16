// The renderer's Chrome, as `ps` sees it: this process opens a view with the
// renderer's flags (`launchArgs`, this platform's), reads the Chrome whose
// parent is this process, kills it, opens another view (Bun spawns Chrome
// again) and reads that one. It prints one JSON line: its own pid and each
// Chrome's command line. Run by `e2e/tools/renderer-chrome.dom.test.ts`, as a
// process of its own: Bun spawns one Chrome per process, with the first
// view's flags.

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Duration, Effect, Schedule, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { launchArgs } from '../browser.ts';
import { openView } from '../chrome.ts';
import { collect } from '../process.ts';

/** The command lines of the Chromes this process spawned (their parent is this process). */
const ours = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const ps = yield* collect(
    spawner,
    ChildProcess.make('ps', ['-axo', 'pid=,ppid=,args='], { forceKillAfter: '5 seconds' }),
  );
  return ps.stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(
      ([, ppid, ...args]) =>
        ppid === String(process.pid) && args.includes('--remote-debugging-pipe'),
    )
    .map(([pid = '', , ...args]) => ({ pid: Number(pid), args: args.join(' ') }));
});

/** A view with the renderer's flags, open while the Chrome under it is read. */
const viewed = Effect.scoped(
  Effect.gen(function* () {
    const view = yield* openView(launchArgs(process.platform), { width: 800, height: 600 });
    yield* Effect.promise(() => view.navigate('about:blank'));
    return yield* ours;
  }),
);

/** What the test reads: this process's pid and each Chrome's command line. */
const Seen = Schema.fromJsonString(
  Schema.Struct({
    pid: Schema.Finite,
    first: Schema.Array(Schema.String),
    second: Schema.Array(Schema.String),
  }),
);

Effect.gen(function* () {
  const first = yield* viewed;
  for (const chrome of first) process.kill(chrome.pid, 'SIGKILL');
  // The next view opens once the killed Chrome is gone.
  yield* Effect.filterOrFail(ours, (left) => left.length === 0).pipe(
    Effect.retry({ schedule: Schedule.spaced(Duration.millis(100)), times: 50 }),
  );
  const second = yield* viewed;
  yield* Console.log(
    yield* Schema.encodeEffect(Seen)({
      pid: process.pid,
      first: first.map((c) => c.args),
      second: second.map((c) => c.args),
    }),
  );
}).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
