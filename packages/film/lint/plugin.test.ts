// The `film` oxlint plugin, run for real: oxlint lints each fixture in
// `fixtures/` with only this plugin on, and what it reports must be exactly the
// lines a fixture marks `// RED film/<rule>`. no-unprobed-ink resolves names
// through scope, which only a real oxlint run provides, so its fixture is its
// test. The mock-AST cases below pin drawing-literal's decision on one node.

import { BunServices } from '@effect/platform-bun';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { Testing } from 'oxlint-plugin-effect/rule-bindings';
import { drawingLiteral } from './drawing-literal.ts';

const text = (stream: Stream.Stream<Uint8Array, unknown>) =>
  Stream.mkString(Stream.decodeText(stream));

/** `file:line rule` for every report oxlint prints in `--format unix`. */
const reported = (out: string): ReadonlyArray<string> =>
  out
    .split('\n')
    .flatMap((line) =>
      Option.toArray(
        Option.map(
          Option.fromNullishOr(
            /^(?:.*\/)?([^/:]+):(\d+):\d+: .*\[\w+\/film\(([\w-]+)\)\]$/.exec(line),
          ),
          (m) => `${m[1]}:${m[2]} film/${m[3]}`,
        ),
      ),
    )
    .sort();

/** `file:line rule` for every line a fixture marks RED. */
const marked = (file: string, source: string): ReadonlyArray<string> =>
  source
    .split('\n')
    .flatMap((line, i) =>
      Option.toArray(
        Option.map(
          Option.fromNullishOr(/\/\/ RED (film\/[\w-]+)/.exec(line)),
          (m) => `${file}:${i + 1} ${m[1]}`,
        ),
      ),
    );

/** oxlint over the fixtures with the fixtures' config: what it reported, and its exit code. */
const lintFixtures = Effect.fn('test.lintFixtures')(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const path = yield* Path.Path;
  const cwd = path.join(import.meta.dir, 'fixtures');
  const oxlint = path.join(import.meta.dir, '..', '..', '..', 'node_modules', '.bin', 'oxlint');
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(oxlint, ['-c', 'oxlint.json', '--format', 'unix', '.'], { cwd }),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [text(handle.stdout), text(handle.stderr), handle.exitCode],
        { concurrency: 3 },
      );
      return { exitCode: Number(exitCode), out: `${stdout}${stderr}` };
    }),
  );
});

describe('film oxlint plugin', () => {
  it.effect.layer(BunServices.layer)('fires on every RED fixture line and nowhere else', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = path.join(import.meta.dir, 'fixtures');
      const files = (yield* fs.readDirectory(dir)).filter((f) => f.endsWith('.ts'));
      const expected = (yield* Effect.forEach(files, (file) =>
        Effect.map(fs.readFileString(path.join(dir, file)), (source) => marked(file, source)),
      ))
        .flat()
        .sort();
      const run = yield* lintFixtures();
      expect(expected.length).toBeGreaterThan(0);
      expect(reported(run.out)).toEqual(expected);
      expect(run.exitCode).not.toBe(0);
    }),
  );
});

describe('film/drawing-literal', () => {
  test('reports drawing(x) with no object literal', () => {
    const call = {
      ...Testing.callExpr('drawing', [Testing.id('shared')]),
      parent: Testing.program(),
    };
    expect(Testing.runRule(drawingLiteral, 'CallExpression', call)).toHaveLength(1);
  });

  test('reports a scene object outside drawing()', () => {
    const scene = {
      ...Testing.objectExpr([{ key: 'timeline' }, { key: 'draw' }]),
      parent: Testing.program(),
    };
    expect(Testing.runRule(drawingLiteral, 'ObjectExpression', scene)).toHaveLength(1);
  });
});
