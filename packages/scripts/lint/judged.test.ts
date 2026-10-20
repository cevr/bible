// The `judged` oxlint plugin, run for real: oxlint lints a scratch repo with
// only this plugin on, over a store of kept answers and a run's findings
// file, and reports exactly the items whose answer is at or over the rule's
// threshold, wherever their text lives.

import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path, Schema, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { Findings, ruleSignature, textHash } from '../src/judged/findings.ts';
import { itemsOf, parse } from '../src/judged/items.ts';
import { ruleKey } from '../src/judged/rule.ts';
import { Store, cacheKey } from '../src/judged/store.ts';
import { historyComment } from '../src/judged/testing.ts';

/** The timeout of a test here that spawns (oxlint): a cold start's time is the machine's. */
const SPAWNS_MS = 30_000;

const PLUGIN = new URL('./judged.ts', import.meta.url).pathname;
const OXLINT = new URL('../../../node_modules/.bin/oxlint', import.meta.url).pathname;

const SOURCE = [
  '// This used to retry; pass 6 removed that.',
  'const a = 1;',
  '',
  '// The key used to sign each token.',
  'const b = 2;',
  '',
  '// We switched to Rive in the spring.',
  'const c = 3;',
].join('\n');

/** The history comment moved to another file, indented in a block and wrapped. */
const MOVED = [
  'export const f = () => {',
  '  // This used to retry;',
  '  // pass 6 removed that.',
  '  return 1;',
  '};',
].join('\n');

/** Runs oxlint in `cwd`; answers its exit code and the judged lines it prints. */
const oxlint = (cwd: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make(OXLINT, ['--format', 'unix', '-c', 'oxlintrc.json', 'src'], {
          cwd,
          forceKillAfter: '5 seconds',
        }),
      );
      const [out, code] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
        { concurrency: 'unbounded' },
      );
      return {
        code: Number(code),
        out,
        lines: out
          .split('\n')
          .filter((line) => line.includes('judged('))
          .map((line) => line.replace(/^.*?(src\/)/, '$1'))
          .toSorted(),
      };
    }),
  );

/** A scratch repo linted by historyComment alone at `severity` (its selector `selector`), its store `.git/kept.json`. */
const scratch = (severity: 'warn' | 'error', selector: string = historyComment.selector) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'judged-plugin-' });
    const { id, severity: _, ...options } = historyComment;
    yield* fs.writeFileString(
      path.join(dir, 'oxlintrc.json'),
      yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
        categories: { correctness: 'off' },
        plugins: [],
        jsPlugins: [PLUGIN],
        settings: { judged: { model: 'jev-1.13.0', store: 'kept.json', checkout: 'tmp/judged' } },
        rules: { [`judged/${id}`]: [severity, { ...options, selector }] },
      }),
    );
    yield* fs.makeDirectory(path.join(dir, 'src'));
    yield* fs.makeDirectory(path.join(dir, '.git'));
    return dir;
  });

/** The store answering each of `SOURCE`'s comments history at the given probability. */
const storeOf = (ps: ReadonlyArray<number>) => {
  const keyOf = (text: string) => cacheKey(ruleKey(historyComment), 'typesafe/jev-1.13.0', text);
  const comments = itemsOf('comments', parse('src/x.ts', SOURCE));
  return Schema.encodeEffect(Store)({
    answers: Object.fromEntries(
      comments.map((item, i) => [
        keyOf(item.key),
        {
          label: 'history',
          probabilities: { today: 1 - (ps[i] ?? 0), history: ps[i] ?? 0 },
          seen: 0,
        },
      ]),
    ),
  });
};

const REPORT =
  "the comment tells the code's history: say what it does today and why; how it got here lives in git log";

describe('the judged plugin', () => {
  it.live(
    'reports a kept answer at or over its threshold, at its line, and nothing with no store',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* scratch('warn');
        yield* fs.writeFileString(path.join(dir, 'src/x.ts'), SOURCE);
        yield* fs.writeFileString(
          path.join(dir, '.git', 'kept.json'),
          yield* storeOf([0.95, 0.89, 0.9]),
        );
        expect((yield* oxlint(dir)).lines).toEqual([
          `src/x.ts:1:1: ${REPORT} p=0.95 [Warning/judged(historyComment)]`,
          `src/x.ts:7:1: ${REPORT} p=0.90 [Warning/judged(historyComment)]`,
        ]);
        // No store: the rule says nothing.
        yield* fs.remove(path.join(dir, '.git', 'kept.json'));
        expect((yield* oxlint(dir)).lines).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    SPAWNS_MS,
  );

  it.live(
    'reports a kept breach wherever its text now lives, moved, copied or re-indented, and fails at error',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* scratch('error');
        yield* fs.writeFileString(
          path.join(dir, '.git', 'kept.json'),
          yield* storeOf([0.95, 0.02, 0.02]),
        );
        // The store was written for src/x.ts; the text is now in src/y/z.ts alone.
        yield* fs.makeDirectory(path.join(dir, 'src/y'));
        yield* fs.writeFileString(path.join(dir, 'src/y/z.ts'), MOVED);
        const moved = yield* oxlint(dir);
        expect(moved.lines).toEqual([
          `src/y/z.ts:2:3: ${REPORT} p=0.95 [Error/judged(historyComment)]`,
        ]);
        expect(moved.code).not.toBe(0);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    SPAWNS_MS,
  );

  it.live(
    "reports the last run's findings of a file as it stands, and the store's for a file changed since or a rule of other words",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* scratch('warn');
        const changed = `${SOURCE}\nconst d = 4;`;
        yield* fs.writeFileString(path.join(dir, 'src/x.ts'), SOURCE);
        yield* fs.writeFileString(path.join(dir, 'src/w.ts'), changed);
        yield* fs.writeFileString(
          path.join(dir, '.git', 'kept.json'),
          yield* storeOf([0.95, 0.02, 0.02]),
        );
        // The run found the second comment alone: the store, read, would say the first.
        const run = [{ start: SOURCE.indexOf('// The key'), p: 0.97 }];
        const findings = (signature: string) =>
          Effect.flatMap(
            Schema.encodeEffect(Findings)({
              rules: { historyComment: signature },
              files: {
                'src/x.ts': { hash: textHash(SOURCE), rules: { historyComment: run } },
                'src/w.ts': { hash: textHash(SOURCE), rules: { historyComment: run } },
              },
            }),
            (text) => fs.writeFileString(path.join(dir, 'tmp/judged/findings.json'), text),
          );
        yield* fs.makeDirectory(path.join(dir, 'tmp/judged'), { recursive: true });
        yield* findings(ruleSignature('typesafe/jev-1.13.0', historyComment));
        expect((yield* oxlint(dir)).lines).toEqual([
          `src/w.ts:1:1: ${REPORT} p=0.95 [Warning/judged(historyComment)]`,
          `src/x.ts:4:1: ${REPORT} p=0.97 [Warning/judged(historyComment)]`,
        ]);
        yield* findings(
          ruleSignature('typesafe/jev-1.13.0', { ...historyComment, threshold: 0.5 }),
        );
        expect((yield* oxlint(dir)).lines).toEqual([
          `src/w.ts:1:1: ${REPORT} p=0.95 [Warning/judged(historyComment)]`,
          `src/x.ts:1:1: ${REPORT} p=0.95 [Warning/judged(historyComment)]`,
        ]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    SPAWNS_MS,
  );

  it.live(
    'refuses a misspelt selector once, by the rule, before it lints a file',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* scratch('warn', 'comment');
        yield* fs.writeFileString(path.join(dir, 'src/x.ts'), SOURCE);
        const refused = yield* oxlint(dir);
        expect(refused.code).not.toBe(0);
        expect(refused.out).toContain("Options validation failed for rule 'judged/historyComment'");
        expect(refused.out).not.toContain('SchemaError');
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    SPAWNS_MS,
  );
});
