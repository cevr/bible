// The judged rules' one source, the repo's `.oxlintrc.json`: what the runner
// reads of it, and that the plugin defines exactly the rules it names.

import * as BunServices from '@effect/platform-bun/BunServices';
import { JSONC } from 'bun';
import { Effect, FileSystem, Path, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { JudgedLint, judgedLintLayer } from './config.js';
import { RULE_IDS } from '../../lint/judged.ts';
import { historyComment } from './testing.js';

/** What the test reads of a lint config: its rules' names. */
const Entries = Schema.Struct({ rules: Schema.Record(Schema.String, Schema.Unknown) });

/** The judged lint of the repo at `dir`, as a run reads it. */
const lintOf = (dir: string) =>
  Effect.gen(function* () {
    return yield* JudgedLint;
  }).pipe(Effect.provide(judgedLintLayer(dir)));

/** The judged lint a repo whose `.oxlintrc.json` is `text` declares. */
const readJudgedConfig = (text: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'judged-config-' });
    yield* spawner.exitCode(
      ChildProcess.make('git', ['init', '-q', dir], { forceKillAfter: '5 seconds' }),
    );
    yield* fs.writeFileString(path.join(dir, '.oxlintrc.json'), text);
    return yield* lintOf(dir);
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer));

const SETTINGS =
  '"settings": { "judged": { "model": "m", "store": "judged/s.json", "checkout": "tmp/j" } }';

/** A config's text: its settings and `rules`. */
const configOf = (rules: string) => `{ ${SETTINGS}, "rules": { ${rules} } }`;

const OPTIONS = `{
  "version": 1, "selector": "comments", "subject": "code comment", "instructions": "X.",
  "criteria": { "yes": "y", "no": "n" }, "reports": "yes", "threshold": 0.8, "message": "m"
}`;

describe("the judged rules in the repo's lint config", () => {
  it.effect('are the rules the plugin defines, on or off, and historyComment keeps its words', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const config = yield* lintOf(import.meta.dir);
      const { rules } = yield* Schema.decodeUnknownEffect(Entries)(
        JSONC.parse(yield* fs.readFileString(`${config.root}/.oxlintrc.json`)),
      );
      const entries = Object.keys(rules).filter((name) => name.startsWith('judged/'));
      expect(entries.map((name) => name.slice('judged/'.length)).toSorted()).toEqual(
        [...RULE_IDS].toSorted(),
      );
      expect(config.rules.find((rule) => rule.id === 'historyComment')).toEqual(historyComment);
      expect(config.settings.model).toBe('jev-1.13.0');
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('reads a rule at warn or error, drops one at off, and keeps the ignore patterns', () =>
    Effect.gen(function* () {
      const config = yield* readJudgedConfig(
        `{ "ignorePatterns": ["**/dist/**"], ${SETTINGS}, "rules": {
          // A comment, as JSONC allows.
          "judged/a": ["warn", ${OPTIONS}],
          "judged/b": ["error", ${OPTIONS}],
          "judged/c": "off",
          "judged/d": ["off", ${OPTIONS}],
          "eslint/no-debugger": "error"
        } }`,
      );
      expect(config.rules.map((rule) => [rule.id, rule.severity])).toEqual([
        ['a', 'warn'],
        ['b', 'error'],
      ]);
      expect(config.ignorePatterns).toEqual(['**/dist/**']);
      expect(config.settings).toEqual({ model: 'm', store: 'judged/s.json', checkout: 'tmp/j' });
    }),
  );

  it.effect('refuses, tagged and named, a config it cannot read', () =>
    Effect.gen(function* () {
      const refused = (text: string) =>
        Effect.map(Effect.flip(readJudgedConfig(text)), (error) => [
          error._tag,
          'detail' in error && error.detail,
        ]);
      expect(yield* refused('{ "rules": [')).toEqual(['LintConfigUnreadable', 'not JSONC']);
      expect(yield* refused('{ "rules": {} }')).toEqual([
        'LintConfigUnreadable',
        'it has no settings.judged (model, store)',
      ]);
      expect(yield* refused(configOf('"judged/a": "warn"'))).toEqual([
        'LintConfigUnreadable',
        'judged/a is neither "off" nor [severity, the options of a judged rule]',
      ]);
      const reportsNoLabel = OPTIONS.replace('"reports": "yes"', '"reports": "maybe"');
      expect(yield* refused(configOf(`"judged/a": ["warn", ${reportsNoLabel}]`))).toEqual([
        'LintConfigUnreadable',
        'judged/a is neither "off" nor [severity, the options of a judged rule]',
      ]);
    }),
  );
});
