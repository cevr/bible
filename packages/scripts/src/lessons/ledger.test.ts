import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path } from 'effect';
import { ledgerProblems, reviewRoutes } from './ledger.ts';

/** An entry of a ledger, its Guard and its Kind as given, its other fields well formed. */
const entry = (id: string, guard: string, kind = 'owner', source = 'memory x.md') =>
  [
    `### ${id}`,
    '',
    '- **Date:** 2026-10-19',
    `- **Kind:** ${kind}`,
    '- **Said:** "do it so"',
    `- **Source:** ${source}`,
    '- **Wrong:** it was not so.',
    '- **Cause:** Not recorded.',
    `- **Guard:** ${guard}`,
    '',
  ].join('\n');

/** The lint config of the scratch repos: one rule on, one judged rule gating, one warning. */
const CONFIG = `{
  // comments, as JSONC
  "rules": { "no-console": "error", "judged/gates": ["error", {}], "judged/warns": ["warn", {}] },
  "overrides": [{ "files": ["**/lint/**"], "rules": { "film/own-rule": ["error", {}], "eqeqeq": "warn" } }]
}`;

/** The files the scratch repos hold beside their ledger. */
const FILES = {
  '.oxlintrc.json': CONFIG,
  'src/thing.ts': "export const held = 1;\n// unheld\ntest('refuses a thing', () => {});\n",
  'lint/fixtures/own.ts': 'call(); // RED film/own-rule\n',
  'skills/SKILL.md': 'Say what the code does.\n',
  'judged/gates.json': '{ "rule": "gates", "cases": [] }',
  'judged/warns.json': '{ "rule": "warns", "cases": [] }',
};

/** A scratch repo with `ledger` as its docs/lessons.md beside `FILES`, and its root. */
const repoWith = (ledger: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: 'lessons-' });
    yield* Effect.forEach(Object.entries({ ...FILES, 'docs/lessons.md': ledger }), ([file, text]) =>
      Effect.gen(function* () {
        yield* fs.makeDirectory(path.dirname(path.join(root, file)), { recursive: true });
        yield* fs.writeFileString(path.join(root, file), text);
      }),
    );
    return root;
  });

/** The problems the ledger check finds in a scratch repo whose ledger holds `entries`. */
const problemsOf = (...entries: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const root = yield* repoWith(`# Lessons\n\n## A section\n\n${entries.join('\n')}`);
    return (yield* ledgerProblems(root)).problems;
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe('the lessons ledger', () => {
  it.effect('holds each guard class that its file holds', () =>
    Effect.gen(function* () {
      expect(
        yield* problemsOf(
          entry('a-lint', 'lint:no-console, proof `src/thing.ts` `refuses a thing`'),
          entry(
            'a-plugin-lint',
            'lint:film/own-rule, proof `lint/fixtures/own.ts` `RED film/own-rule`',
          ),
          entry('a-judged', 'judged:gates, corpus `judged/gates.json` (precision 1.00)'),
          entry(
            'a-skill',
            'skill: words are content. Carried by `skills/SKILL.md`: "Say what the code does."',
          ),
          entry('a-code', 'code: `src/thing.ts` `held` (the check)'),
          entry(
            'a-none',
            'none: the finding was wrong about the order',
            'review',
            'p6-x/review-1.md F2',
          ),
        ),
      ).toEqual([]);
    }),
  );

  it.effect('refuses each guard its file does not hold', () =>
    Effect.gen(function* () {
      expect(
        yield* problemsOf(
          entry('lint-off', 'lint:eqeqeq, proof `src/thing.ts` `refuses a thing`'),
          entry('lint-unproved', 'lint:no-console'),
          entry('lint-proof-lost', 'lint:no-console, proof `src/thing.ts` `refuses another`'),
          entry('judged-warns', 'judged:warns, corpus `judged/warns.json`'),
          entry('judged-other-corpus', 'judged:gates, corpus `judged/warns.json`'),
          entry(
            'skill-reworded',
            'skill: words are content. Carried by `skills/SKILL.md`: "Say what it does."',
          ),
          entry('code-in-comment', 'code: `src/thing.ts` `unheld`'),
          entry('code-no-file', 'code: `src/gone.ts` `held`'),
          entry('unclassed', '`src/thing.ts` `held`'),
          entry('none-empty', 'none: '),
        ),
      ).toEqual([
        'lint-off: eqeqeq is not on at error in .oxlintrc.json',
        'lint-unproved: a lint guard names its rule and its proof: lint:<rule>, proof `file` `name`',
        'lint-proof-lost: src/thing.ts does not hold "refuses another"',
        'judged-warns: judged/warns does not gate: a rule that warns guards nothing',
        'judged-other-corpus: judged/warns.json is not the corpus of gates',
        'skill-reworded: skills/SKILL.md does not hold "Say what it does."',
        'code-in-comment: src/thing.ts does not hold "unheld"',
        'code-no-file: no file src/gone.ts',
        'unclassed: the guard is none of lint:, judged:, skill:, code: or none:',
        'none-empty: the guard is none of lint:, judged:, skill:, code: or none:',
      ]);
    }),
  );

  it.effect("refuses an entry's fields of the wrong shape", () =>
    Effect.gen(function* () {
      const fine = entry('fine', 'none: a reason');
      expect(
        yield* problemsOf(
          fine.replace('2026-10-19', '19 Oct').replace('### fine', '### bad-date'),
          fine.replace('Kind:** owner', 'Kind:** agent').replace('### fine', '### bad-kind'),
          fine.replace('"do it so"', 'do it so').replace('### fine', '### unquoted'),
          entry('review-uncited', 'none: a reason', 'review', 'a review'),
          fine.replace('- **Cause:** Not recorded.\n', '').replace('### fine', '### no-cause'),
        ),
      ).toEqual([
        'bad-date: date 19 Oct',
        'bad-kind: kind agent is none of owner, review, retraction',
        'unquoted: said is neither the words in quotes nor a choice',
        'review-uncited: a review entry cites no finding (<unit>/<review file> F<n>)',
        'no-cause: no Cause',
      ]);
    }),
  );

  it.effect.layer(BunServices.layer)(
    'routes each finding of a review to the entry that cites it, and reads its guard lines',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* repoWith(
            [
              '# Lessons',
              entry('folded', 'none: a reason', 'review', 'p6-x/review-1.md F1; the fix 1a2b3c'),
              entry('declined', 'none: a reason', 'review', 'p6-x/review-1.md F21'),
            ].join('\n'),
          );
          const unit = path.join(root, 'tmp', 'p6-x');
          yield* fs.makeDirectory(unit, { recursive: true });
          const review = path.join(unit, 'review-1.md');
          yield* fs.writeFileString(
            review,
            [
              'CHANGES',
              '### F1 High: the parts drop a file',
              '- **Guard class:** code',
              '- **Cheapest guard:** a test of partsOf',
              '### F2 Low: a comment overclaims',
              'Guard class: skill',
              '### F21 Medium: no guard named',
              'Cheapest guard: none',
              '### F3 Low: a name reads oddly',
              'Guard class: none',
              'Cheapest guard: none',
            ].join('\n'),
          );
          const routes = yield* reviewRoutes(root, [review]);
          expect(
            routes.map((route) => [
              route.ref,
              Option.getOrElse(route.by, () => 'unrouted'),
              route.classed,
              route.guarded,
              route.declined,
            ]),
          ).toEqual([
            ['p6-x/review-1.md F1', 'folded', true, true, false],
            ['p6-x/review-1.md F2', 'unrouted', true, false, false],
            ['p6-x/review-1.md F21', 'declined', false, true, false],
            ['p6-x/review-1.md F3', 'unrouted', true, true, true],
          ]);
        }),
      ),
  );
});
