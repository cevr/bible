// The gate's two phases as the root manifest, turbo's config and
// `gate.sh` lay them: the checks run no workspace's tests, and the tests
// run each workspace's alone, under the host's test lock. Beside the
// checks and one another, a case of 0.47 s alone takes 6.1 s and fails its
// 5 s limit; alone, the same case holds it.

import * as BunServices from '@effect/platform-bun/BunServices';
import { JSONC } from 'bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path, Schema } from 'effect';
import { commandsOf } from './test-budget/shell.ts';

const Manifest = Schema.fromJsonString(
  Schema.Struct({ scripts: Schema.Record(Schema.String, Schema.String) }),
);

const Turbo = Schema.Struct({
  tasks: Schema.Record(
    Schema.String,
    Schema.Struct({ dependsOn: Schema.optionalKey(Schema.Array(Schema.String)) }),
  ),
});

/** The root manifest's scripts, turbo's tasks and `gate.sh`'s text. */
const laid = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(import.meta.dir, '../../..');
  const { scripts } = yield* Schema.decodeEffect(Manifest)(
    yield* fs.readFileString(path.join(root, 'package.json')),
  );
  const turbo = yield* Schema.decodeUnknownEffect(Turbo)(
    JSONC.parse(yield* fs.readFileString(path.join(root, 'turbo.json'))),
  );
  const sh = yield* fs.readFileString(path.join(import.meta.dir, 'gate.sh'));
  return { scripts, turbo, sh };
}).pipe(Effect.provide(BunServices.layer));

/** A script's commands, and those of each script `concurrently` runs in it. */
const commandsIn = (script: string): ReadonlyArray<ReadonlyArray<string>> =>
  commandsOf(script).flatMap((command) => {
    if (command[0] !== 'concurrently') return [command];
    return command
      .slice(1)
      .filter((word) => !word.startsWith('-'))
      .flatMap(commandsIn);
  });

/** A command that is `turbo run` with `task` among its tasks. */
const runsTask = (command: ReadonlyArray<string>, task: string) =>
  command[0] === 'turbo' && command[1] === 'run' && command.slice(2).includes(task);

describe("the gate's phases", () => {
  it.effect('the gate is gate.sh: the checks, then the tests under the lock', () =>
    Effect.gen(function* () {
      const { scripts, sh } = yield* laid;
      expect(commandsOf(scripts['gate'] ?? '')).toEqual([['sh', 'packages/scripts/src/gate.sh']]);
      const lines = sh.split('\n').map((line) => line.trim());
      const checks = lines.indexOf('low bun run gate:checks');
      const tests = lines.indexOf('locked bun run gate:tests');
      expect(checks).toBeGreaterThan(-1);
      expect(tests).toBeGreaterThan(checks);
    }),
  );

  it.effect("the checks run no workspace's test: turbo's gate task depends on none", () =>
    Effect.gen(function* () {
      const { scripts, turbo } = yield* laid;
      const commands = commandsIn(scripts['gate:checks'] ?? '');
      expect(commands.some((command) => runsTask(command, 'gate'))).toBe(true);
      expect(commands.filter((command) => runsTask(command, 'test'))).toEqual([]);
      expect(turbo.tasks['gate']?.dependsOn ?? []).not.toContain('test');
      expect(turbo.tasks['gate']?.dependsOn ?? []).not.toContain('^test');
    }),
  );

  it.effect("the tests run each workspace's alone, one after another", () =>
    Effect.gen(function* () {
      const { scripts } = yield* laid;
      const runs = commandsIn(scripts['gate:tests'] ?? '').filter((command) =>
        runsTask(command, 'test'),
      );
      expect(runs).toHaveLength(1);
      expect(runs[0]).toContain('--concurrency=1');
    }),
  );
});
