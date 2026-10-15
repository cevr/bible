import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { aloneArgs, failuresIn, newAgainst, verdictMarkdown, verdictOf } from './e2e-verdict.ts';

/** The suite's script, as `packages/film/package.json` names it. */
const SUITE =
  'bun src/lab/fixtures/run-suite.ts --parallel --no-isolate --max-concurrency=3 --timeout 20000 e2e';

/** A local run's output, as `bun test` prints it to a file. */
const LOCAL = [
  'e2e/lab/shell.dom.test.ts:',
  '(pass) the lab shell > Go to… opens the menu [812.20ms]',
  '(fail) the lab shell > Back undoes a pick, and Forward makes it again [20384.80ms]',
  '  ^ this test timed out after 20000ms.',
  '',
  'e2e/lab/fixtures/browsers.dom.test.ts:',
  '(fail) the pool of views > lends a view to the next case with nothing of the last case left in it [986.57ms]',
  '',
  ' 1 pass',
  ' 2 fail',
].join('\n');

/** The same as CI prints it (`gh run view --log-failed`): prefixed, grouped, coloured, summed up at the end. */
const CI = [
  'e2e\tRun bun run test:e2e\t2026-10-15T12:44:41.8043526Z ##[group]e2e/lab/fixtures/browsers.dom.test.ts:',
  'e2e\tRun bun run test:e2e\t2026-10-15T12:44:41.9Z \u001b[31m✗\u001b[0m the pool of views > lends a view to the next case with nothing of the last case left in it [986.57ms]',
  'e2e\tRun bun run test:e2e\t2026-10-15T12:44:42.0Z ##[endgroup]',
  'e2e\tRun bun run test:e2e\t2026-10-15T12:44:42.1Z ✗ e2e/player/player.dom.test.ts (worker crashed: SIGKILL)',
  'e2e\tRun bun run test:e2e\t2026-10-15T12:44:43.0Z 2 tests failed:',
  'e2e\tRun bun run test:e2e\t2026-10-15T12:44:43.1Z ✗ the pool of views > lends a view to the next case with nothing of the last case left in it [986.57ms]',
].join('\n');

const POOL =
  'the pool of views > lends a view to the next case with nothing of the last case left in it';

describe('the e2e check', () => {
  test("reads each failed case once, with the file bun printed above it, from a local run's log", () => {
    expect(failuresIn(LOCAL)).toEqual([
      {
        file: Option.some('e2e/lab/shell.dom.test.ts'),
        name: 'the lab shell > Back undoes a pick, and Forward makes it again',
      },
      { file: Option.some('e2e/lab/fixtures/browsers.dom.test.ts'), name: POOL },
    ]);
  });

  test("reads CI's log too, its summary adding nothing, a crashed worker's file a failure of its own", () => {
    const failures = failuresIn(CI);
    expect(failures).toEqual([
      { file: Option.some('e2e/lab/fixtures/browsers.dom.test.ts'), name: POOL },
      {
        file: Option.some('e2e/player/player.dom.test.ts'),
        name: 'e2e/player/player.dom.test.ts (worker crashed: SIGKILL)',
      },
    ]);
  });

  test('a failure the base log holds is not new', () => {
    expect(newAgainst(failuresIn(LOCAL), failuresIn(CI)).map((f) => f.name)).toEqual([
      'the lab shell > Back undoes a pick, and Forward makes it again',
    ]);
  });

  test("a case reruns alone through the suite's own runner and flags, a crashed worker's file whole", () => {
    const args = failuresIn(CI).map((failure) => aloneArgs(SUITE, failure));
    expect(args.map((a) => a.slice(0, 7))).toEqual([
      [
        'bun',
        'src/lab/fixtures/run-suite.ts',
        '--no-isolate',
        '--timeout',
        '20000',
        'e2e/lab/fixtures/browsers.dom.test.ts',
        '-t',
      ],
      [
        'bun',
        'src/lab/fixtures/run-suite.ts',
        '--no-isolate',
        '--timeout',
        '20000',
        'e2e/player/player.dom.test.ts',
      ],
    ]);
  });

  test("a case's pattern matches its describe and name joined by a space, its punctuation literal", () => {
    const name = 'the studio > Keep (K) works… [twice]?';
    const pattern = new RegExp(
      aloneArgs(SUITE, { file: Option.some('e2e/s.dom.test.ts'), name }).at(-1) ?? '',
    );
    expect(pattern.test('the studio Keep (K) works… [twice]?')).toBe(true);
    expect(pattern.test('the studio Keep (K) works… [twice]? and more')).toBe(false);
    expect(pattern.test('the studio > Keep (K) works… [twice]?')).toBe(false);
  });

  test('a new failure green alone three times is load-only; red alone even once, the unit caused it', () => {
    expect(verdictOf([true, true, true])).toBe('load-only');
    expect(verdictOf([true, false, true])).toBe('unit-caused');
    expect(verdictOf([false, false, false])).toBe('unit-caused');
    expect(verdictOf([])).toBe('unit-caused');
  });

  test("the verdict file leads with the unit's failures and counts each class", () => {
    const md = verdictMarkdown({
      log: 'tmp/e2e/run.log',
      base: Option.some('tmp/e2e/base.log'),
      exit: 1,
      seconds: 612,
      judged: [
        {
          failure: { file: Option.some('e2e/a.dom.test.ts'), name: 'a > loaded' },
          alone: [true, true, true],
          verdict: 'load-only',
        },
        {
          failure: { file: Option.some('e2e/b.dom.test.ts'), name: 'b > broken | badly' },
          alone: [false, false, false],
          verdict: 'unit-caused',
        },
        { failure: { file: Option.none(), name: 'c > old' }, alone: [], verdict: 'base' },
      ],
    });
    expect(md.split('\n')).toEqual([
      '# e2e verdict: 1 unit-caused',
      '',
      '- log: `tmp/e2e/run.log` (exit 1, 612 s)',
      '- base: `tmp/e2e/base.log`',
      '- failures: 3 — unit-caused 1, load-only 1, base 1',
      '',
      '| verdict | file | case | alone ×3 |',
      '| --- | --- | --- | --- |',
      '| unit-caused | e2e/b.dom.test.ts | b > broken \\| badly | fail fail fail |',
      '| load-only | e2e/a.dom.test.ts | a > loaded | pass pass pass |',
      '| base | ? | c > old | — |',
      '',
    ]);
  });
});
