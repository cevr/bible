/**
 * `bun run sim <command>`: drive the hymnal on the `verify-hymnal` simulator
 * or in a headless browser, one JSON result per command on stdout. The
 * commands: `scripts/sim/command.ts`; the drive: `scripts/sim/drive.ts`. The
 * verify-hymnal skill (`.claude/skills/verify-hymnal`) drives through it.
 */
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Layer, Path, Stdio } from 'effect';
import { FetchHttpClient } from 'effect/http';

import { runSim } from './sim/command.ts';

const main = Effect.gen(function* () {
  const path = yield* Path.Path;
  const script = yield* path.fromFileUrl(new URL(import.meta.url));
  const app = path.dirname(path.dirname(script));
  const state = path.join(app, '..', '..', 'tmp', 'verify-hymnal');
  const args = yield* Stdio.Stdio.pipe(Effect.flatMap((stdio) => stdio.args));
  return yield* runSim({ app, state: path.normalize(state), script }, args);
});

// A command prints its own failure as its JSON result (stdout stays one JSON
// line), so the runtime reports only a defect, on stderr; a failure still
// exits non-zero.
main.pipe(
  Effect.tapDefect((defect) => Console.error(defect)),
  Effect.provide(Layer.merge(BunServices.layer, FetchHttpClient.layer)),
  (program) => BunRuntime.runMain(program, { disableErrorReporting: true }),
);
