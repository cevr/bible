// The `judged` oxlint plugin, run for real: oxlint lints a scratch repo with
// only this plugin on, over a store of kept answers, and reports exactly the
// items whose answer is at or over the rule's threshold, in the files the
// store says the rule has judged.

import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path, Schema, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { itemsOf, parse } from '../src/judged/items.ts';
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
].join('\n');

/** Runs oxlint in `cwd`; answers what it prints. */
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
      const [out] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
        { concurrency: 'unbounded' },
      );
      return out
        .split('\n')
        .filter((line) => line.includes('judged('))
        .map((line) => line.replace(/^.*?(src\/)/, '$1'));
    }),
  );

describe('the judged plugin', () => {
  it.live(
    'reports a kept answer at or over its threshold, at its line, in a file the store has judged under the rule',
    () =>
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
            settings: { judged: { model: 'jev-latest', cache: 'kept.json' } },
            rules: { [`judged/${id}`]: ['warn', options] },
          }),
        );
        yield* fs.makeDirectory(path.join(dir, 'src'));
        for (const file of ['src/judged.ts', 'src/unjudged.ts'])
          yield* fs.writeFileString(path.join(dir, file), SOURCE);
        const [history, today] = itemsOf('comments', parse('src/judged.ts', SOURCE));
        const keyOf = (text: string) => cacheKey('historyComment@1', 'typesafe/jev-latest', text);
        yield* fs.writeFileString(
          path.join(dir, 'kept.json'),
          yield* Schema.encodeEffect(Store)({
            answers: {
              [keyOf(history!.text)]: {
                label: 'history',
                probabilities: { today: 0.05, history: 0.95 },
              },
              [keyOf(today!.text)]: {
                label: 'history',
                probabilities: { today: 0.11, history: 0.89 },
              },
            },
            files: { 'src/judged.ts': ['historyComment'], 'src/unjudged.ts': ['otherRule'] },
          }),
        );
        expect(yield* oxlint(dir)).toEqual([
          "src/judged.ts:1:1: the comment tells the code's history: say what it does today and why; how it got here lives in git log p=0.95 [Warning/judged(historyComment)]",
        ]);
        // No store: the rule says nothing.
        yield* fs.remove(path.join(dir, 'kept.json'));
        expect(yield* oxlint(dir)).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    SPAWNS_MS,
  );
});
