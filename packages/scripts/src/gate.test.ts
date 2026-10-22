// The gate and the slow suite as the root manifest, turbo's config, `gate.sh`
// and `test-slow.sh` lay them. The gate is the lint's deterministic rules
// beside every workspace's unit tests, each cached on its inputs, under no
// lock. Everything else (typecheck, builds, slow tests, browser checks, the
// full lint) is the slow suite, run one task at a time under the host's test
// lock, by hand and before each deploy.

import * as BunServices from '@effect/platform-bun/BunServices';
import { JSONC } from 'bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { commandsOf } from './test-budget/shell.ts';

const Manifest = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.optionalKey(Schema.String),
    scripts: Schema.Record(Schema.String, Schema.String),
  }),
);

const Turbo = Schema.Struct({
  tasks: Schema.Record(
    Schema.String,
    Schema.Struct({
      dependsOn: Schema.optionalKey(Schema.Array(Schema.String)),
      inputs: Schema.optionalKey(Schema.Array(Schema.String)),
      cache: Schema.optionalKey(Schema.Boolean),
    }),
  ),
});

/** The root manifest's scripts, turbo's tasks, the two shell scripts' lines and each workspace's manifest. */
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
  const linesOf = (file: string) =>
    Effect.map(fs.readFileString(path.join(import.meta.dir, file)), (text) =>
      text.split('\n').map((line) => line.trim()),
    );
  const gate = yield* linesOf('gate.sh');
  const slow = yield* linesOf('test-slow.sh');
  const hooks = (yield* fs.readFileString(path.join(root, 'lefthook.yml')))
    .split('\n')
    .map((line) => line.trim());
  const packages = yield* Effect.forEach(['apps', 'packages'], (group) =>
    Effect.flatMap(fs.readDirectory(path.join(root, group)), (names) =>
      Effect.forEach(names, (name) =>
        Effect.map(
          fs
            .readFileString(path.join(root, group, name, 'package.json'))
            .pipe(Effect.flatMap(Schema.decodeEffect(Manifest)), Effect.option),
          (manifest) => ({ dir: `${group}/${name}`, manifest }),
        ),
      ),
    ),
  );
  return { scripts, turbo, gate, slow, hooks, packages: packages.flat() };
}).pipe(Effect.provide(BunServices.layer));

/** The `turbo run` lines of a shell script, each as its words. */
const turboRuns = (lines: ReadonlyArray<string>) =>
  lines
    .filter((line) => line.startsWith('node_modules/.bin/turbo run '))
    .map((line) => ['turbo', ...line.split(/\s+/).slice(1)]);

/** Whether a line takes a lock (`flock`, `lockf`). */
const locks = (line: string) => /\b(flock|lockf)\b/.test(line) && !line.startsWith('#');

describe('the gate', () => {
  it.effect('is gate.sh: the lint in the background beside the unit tests, under no lock', () =>
    Effect.gen(function* () {
      const { scripts, gate } = yield* laid;
      expect(commandsOf(scripts['gate'] ?? '')).toEqual([['sh', 'packages/scripts/src/gate.sh']]);
      expect(gate).toContain('bun packages/scripts/src/lint-gate.ts &');
      const runs = turboRuns(gate);
      expect(runs).toHaveLength(1);
      expect(runs[0]?.filter((word) => !word.startsWith('-'))).toEqual(['turbo', 'run', 'test']);
      expect(gate.filter(locks)).toEqual([]);
    }),
  );

  it.effect("caches each workspace's tests on its inputs, and a test waits on no build", () =>
    Effect.gen(function* () {
      const { turbo } = yield* laid;
      const test = turbo.tasks['test'];
      expect(test?.cache).not.toBe(false);
      expect(test?.dependsOn).toEqual(['^transit']);
      expect(test?.inputs).toContain('$TURBO_DEFAULT$');
      expect(turbo.tasks['transit']?.dependsOn).toEqual(['^transit']);
    }),
  );
});

describe('the slow suite', () => {
  it.effect(
    'is test-slow.sh: typecheck, builds and each test:slow one at a time under the lock, then the full lint, the format and the dead exports',
    () =>
      Effect.gen(function* () {
        const { scripts, slow } = yield* laid;
        expect(commandsOf(scripts['test:slow'] ?? '')).toEqual([
          ['sh', 'packages/scripts/src/test-slow.sh'],
        ]);
        expect(slow.filter(locks).length).toBeGreaterThan(0);
        const runs = turboRuns(slow);
        expect(runs).toHaveLength(1);
        expect(runs[0]).toEqual(
          expect.arrayContaining(['typecheck', 'build', 'test:slow', '--concurrency=1']),
        );
        expect(slow).toEqual(
          expect.arrayContaining(['bun run lint', 'bun run fmt:check', 'bun run dead-exports']),
        );
      }),
  );

  it.effect(
    "runs before each deploy: a deploy script runs its workspace's test:slow before alchemy starts",
    () =>
      Effect.gen(function* () {
        const { packages } = yield* laid;
        const deploys = packages.flatMap(({ manifest }) =>
          Option.toArray(manifest)
            .filter(({ scripts }) => 'deploy' in scripts)
            .map(({ name, scripts }) => ({ name, commands: commandsOf(scripts['deploy'] ?? '') })),
        );
        expect(deploys.length).toBeGreaterThan(0);
        for (const { name, commands } of deploys) {
          const slow = commands.findIndex(
            (command) => command.join(' ') === `turbo run test:slow --filter=${name}`,
          );
          const alchemy = commands.findIndex((command) => command[0] === 'alchemy');
          expect([name, slow > -1 && alchemy > slow]).toEqual([name, true]);
        }
      }),
  );

  it.effect("no workspace keeps a gate but Selah's native one, which its test:slow runs", () =>
    Effect.gen(function* () {
      const { packages } = yield* laid;
      const gates = packages.flatMap(({ dir, manifest }) =>
        Option.toArray(manifest)
          .filter(({ scripts }) => 'gate' in scripts)
          .map(({ scripts }) => ({ dir, gate: scripts['gate'], slow: scripts['test:slow'] })),
      );
      expect(gates.map(({ dir }) => dir)).toEqual(['apps/selah']);
      expect(gates[0]?.slow).toBe(gates[0]?.gate);
    }),
  );
});

describe('the pre-commit', () => {
  it.effect(
    'typechecks the workspaces the staged files lie in, each incrementally from its own build info',
    () =>
      Effect.gen(function* () {
        const { hooks, packages } = yield* laid;
        expect(hooks).toContain('run: bun packages/scripts/src/precommit-typecheck.ts');
        const plain = packages.flatMap(({ dir, manifest }) =>
          Option.toArray(manifest).flatMap(({ scripts }) =>
            commandsOf(scripts['typecheck'] ?? '')
              .filter((command) => command[0] === 'tsc' && !command.includes('--incremental'))
              .map(() => dir),
          ),
        );
        expect(plain).toEqual([]);
      }),
  );
});
