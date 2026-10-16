import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';
import {
  BETWEEN_TESTS,
  type Base,
  type Failure,
  type Judged,
  Recorded,
  aloneArgs,
  baseOfLog,
  baseOfRecord,
  blocks,
  failuresIn,
  finishedIn,
  ancestorsIn,
  heldByAncestor,
  lockedBy,
  loadWords,
  recordOf,
  runOf,
  verdictMarkdown,
  verdictOf,
} from './e2e-verdict.ts';

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
  'Ran 3 tests across 2 files. [21.40s]',
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

/** A run in which a case timed out and its fiber failed after it, between tests (round 1's `e2e-1.log`). */
const BETWEEN = [
  'e2e/lab/editor/editor.dom.test.ts:',
  "(fail) the cue strip > a receipt's Undo pressed before the reloaded page knows the step says so [20011.23ms]",
  '  ^ this test timed out after 20000ms.',
  '',
  '# Unhandled error between tests',
  '-------------------------------',
  'error: the browser failed: [data-act="receipt-undo"] was never there to act on within 15000 ms',
  '-------------------------------',
  '',
  ' 9 pass',
  ' 1 fail',
  ' 2 error',
  'Ran 10 tests across 1 file. [64.00s]',
].join('\n');

const POOL =
  'the pool of views > lends a view to the next case with nothing of the last case left in it';
const BACK = 'the lab shell > Back undoes a pick, and Forward makes it again';
const back: Failure = { file: Option.some('e2e/lab/shell.dom.test.ts'), name: BACK, whole: false };

/** A base whose suite finished, failing `failed`, its check having rerun `alone`. */
const baseWith = (
  failed: ReadonlyArray<Failure>,
  alone: ReadonlyArray<Judged> = [],
): Option.Option<Base> => Option.some({ failed, finished: true, alone });

const judged = (verdict: Judged['verdict'], ...alone: Judged['alone']): Judged => ({
  failure: back,
  alone,
  verdict,
});

describe('reading a log', () => {
  test("reads each failed case once, with the file bun printed above it, from a local run's log", () => {
    expect(failuresIn(LOCAL)).toEqual([
      back,
      { file: Option.some('e2e/lab/fixtures/browsers.dom.test.ts'), name: POOL, whole: false },
    ]);
    expect(finishedIn(LOCAL)).toBe(true);
  });

  test("reads CI's log too, its summary adding nothing, a crashed worker's file a failure of its own", () => {
    expect(failuresIn(CI)).toEqual([
      { file: Option.some('e2e/lab/fixtures/browsers.dom.test.ts'), name: POOL, whole: false },
      {
        file: Option.some('e2e/player/player.dom.test.ts'),
        name: 'e2e/player/player.dom.test.ts (worker crashed: SIGKILL)',
        whole: true,
      },
    ]);
  });

  test('an error bun caught between tests fails its file, and one it counted but did not place fails none', () => {
    expect(failuresIn(BETWEEN).slice(1)).toEqual([
      { file: Option.some('e2e/lab/editor/editor.dom.test.ts'), name: BETWEEN_TESTS, whole: true },
      {
        file: Option.none(),
        name: 'an error bun counted that the log does not place (1 of 1)',
        whole: true,
      },
    ]);
  });

  test('a suite cut short, with no `Ran N tests` line, never finished, whatever it named', () => {
    expect(finishedIn(LOCAL.split('\n').slice(0, -1).join('\n'))).toBe(false);
    expect(finishedIn(CI)).toBe(false);
  });

  test('two cases of one name in two files are two failures', () => {
    const twice = [
      'e2e/a.dom.test.ts:',
      '(fail) x > y [1ms]',
      'e2e/b.dom.test.ts:',
      '(fail) x > y [1ms]',
    ].join('\n');
    expect(failuresIn(twice).map((f) => Option.getOrNull(f.file))).toEqual([
      'e2e/a.dom.test.ts',
      'e2e/b.dom.test.ts',
    ]);
  });
});

describe('rerunning a failure alone', () => {
  test("a case reruns through the suite's own runner and flags in one worker, at the suite's own concurrency; a file's failure, the file whole", () => {
    const args = failuresIn(CI).map((failure) => aloneArgs(SUITE, failure));
    expect(args.map((a) => a.slice(0, 8))).toEqual([
      [
        'bun',
        'src/lab/fixtures/run-suite.ts',
        '--no-isolate',
        '--max-concurrency=3',
        '--timeout',
        '20000',
        'e2e/lab/fixtures/browsers.dom.test.ts',
        '-t',
      ],
      [
        'bun',
        'src/lab/fixtures/run-suite.ts',
        '--no-isolate',
        '--max-concurrency=3',
        '--timeout',
        '20000',
        'e2e/player/player.dom.test.ts',
      ],
    ]);
    // A file rerun whole runs its cases no more at once than the suite did: bun's own default is 20.
    expect(
      aloneArgs('bun r.ts --parallel=4 --max-concurrency 3 --timeout 20000 e2e', back).slice(0, 7),
    ).toEqual([
      'bun',
      'r.ts',
      '--max-concurrency',
      '3',
      '--timeout',
      '20000',
      'e2e/lab/shell.dom.test.ts',
    ]);
    expect(aloneArgs('bun r.ts --parallel 4 e2e', back).slice(0, 3)).toEqual([
      'bun',
      'r.ts',
      'e2e/lab/shell.dom.test.ts',
    ]);
  });

  test("a case's pattern matches its describe and name joined by a space, its punctuation literal", () => {
    const name = 'the studio > Keep (K) works… [twice]?';
    const pattern = new RegExp(
      aloneArgs(SUITE, { file: Option.some('e2e/s.dom.test.ts'), name, whole: false }).at(-1) ?? '',
    );
    expect(pattern.test('the studio Keep (K) works… [twice]?')).toBe(true);
    expect(pattern.test('the studio Keep (K) works… [twice]? and more')).toBe(false);
    expect(pattern.test('the studio > Keep (K) works… [twice]?')).toBe(false);
  });

  test('a rerun that ran no test (its filter matched none, or it was cut short) shows nothing', () => {
    expect(runOf(0, 'Ran 1 test across 1 file. [3.38s]')).toBe('pass');
    expect(runOf(1, ' 0 pass\n 1 fail\nRan 1 test across 1 file. [3.38s]')).toBe('fail');
    expect(runOf(1, 'Ran 0 tests across 1 file. [0.10s]')).toBe('none');
    expect(runOf(1, 'error: script exited')).toBe('none');
  });

  test("a rerun bun passed is a pass, though the runner's exit after it is not 0", () => {
    // The case passed; then the runner's cleanup failed (run-suite's folder, `run-folder.ts`).
    const cleanupFailed = [
      ' 1 pass',
      ' 26 filtered out',
      ' 0 fail',
      'Ran 1 test across 1 file. [3.03s]',
      '[09:48:23.472] ERROR (#2): PlatformError: NotFound: FileSystem.makeTempDirectoryScoped (/tmp/film-test-bundles-8ecD5e)',
    ].join('\n');
    expect(runOf(1, cleanupFailed)).toBe('pass');
    expect(runOf(1, ' 1 pass\n 0 fail\n 1 error\nRan 1 test across 1 file. [3.03s]')).toBe('fail');
    expect(runOf(0, ' 0 pass\n 1 fail\nRan 1 test across 1 file. [3.03s]')).toBe('fail');
  });
});

describe('the verdict on a failure', () => {
  test('green alone three times is green alone, whatever the base said', () => {
    expect(verdictOf(back, ['pass', 'pass', 'pass'], Option.none())).toBe('green-alone');
    expect(verdictOf(back, ['pass', 'pass', 'pass'], baseWith([back]))).toBe('green-alone');
  });

  test("red alone is the base's only when the base's own check saw it red alone too", () => {
    const redAtBase = baseWith([back], [judged('base', 'fail', 'pass', 'fail')]);
    expect(verdictOf(back, ['fail', 'fail', 'fail'], redAtBase)).toBe('base');
    // A loaded base that only timed out on it proves nothing.
    expect(verdictOf(back, ['fail', 'fail', 'fail'], baseWith([back]))).toBe('unresolved');
  });

  test("red alone where the base passed it is the unit's: its suite finished without it, or its check saw it green alone", () => {
    expect(verdictOf(back, ['pass', 'fail', 'pass'], baseWith([]))).toBe('unit-caused');
    const greenAtBase = baseWith([back], [judged('green-alone', 'pass', 'pass', 'pass')]);
    expect(verdictOf(back, ['fail', 'fail', 'fail'], greenAtBase)).toBe('unit-caused');
  });

  test('red alone with no base, or a base that never finished, is unresolved; so is a failure that could not rerun', () => {
    expect(verdictOf(back, ['fail', 'fail', 'fail'], Option.none())).toBe('unresolved');
    const unfinished = Option.some({ failed: [], finished: false, alone: [] });
    expect(verdictOf(back, ['fail', 'fail', 'fail'], unfinished)).toBe('unresolved');
    expect(verdictOf(back, ['pass', 'none', 'pass'], baseWith([]))).toBe('unresolved');
    expect(verdictOf(back, [], baseWith([]))).toBe('unresolved');
  });

  test("a check's record reads back as the next check's base", () => {
    const run = [judged('unresolved', 'fail', 'fail', 'fail')];
    const json = Schema.fromJsonString(Recorded);
    const base = baseOfRecord(
      Schema.decodeSync(json)(Schema.encodeSync(json)(recordOf(true, run))),
    );
    expect(base).toEqual({ failed: [back], finished: true, alone: run });
    expect(verdictOf(back, ['fail', 'pass', 'pass'], Option.some(base))).toBe('base');
    expect(baseOfLog(LOCAL)).toEqual({ failed: failuresIn(LOCAL), finished: true, alone: [] });
  });
});

describe('what blocks', () => {
  const green = judged('green-alone', 'pass', 'pass', 'pass');
  test('a unit-caused or unresolved failure, a suite that never finished, or one that failed naming nothing', () => {
    expect(blocks({ exit: 1, finished: true, judged: [green] })).toBe(false);
    expect(blocks({ exit: 1, finished: true, judged: [{ ...green, verdict: 'unresolved' }] })).toBe(
      true,
    );
    expect(blocks({ exit: 1, finished: false, judged: [green] })).toBe(true);
    expect(blocks({ exit: 1, finished: true, judged: [] })).toBe(true);
    expect(blocks({ exit: 0, finished: true, judged: [] })).toBe(false);
  });

  test('a check inside an outer lock on the same file runs in its hold', () => {
    const lock = '/tmp/bible-tools-e2e.lock';
    // macOS: /tmp is a link to /private/tmp, as `realpath` resolves it.
    const real = (path: string) => path.replace(/^\/tmp\//, '/private/tmp/');
    const held = (commands: ReadonlyArray<string>) => heldByAncestor(commands, lock, real);
    const outer = 'lockf -k /tmp/bible-tools-e2e.lock bun run test:e2e:check';
    // `ps -A -o pid= -o ppid= -o command=`: the check (40) under bun run (30) under the lock (20).
    const ps = [
      '    1     0 /sbin/launchd',
      `   20     1 ${outer}`,
      '   30    20 bun run test:e2e:check',
      '   40    30 bun src/lab/fixtures/e2e-check.ts',
      '   50     1 lockf -k /tmp/bible-tools-e2e.lock bun run test:e2e',
    ].join('\n');
    expect(ancestorsIn(ps, 40)).toEqual(['bun run test:e2e:check', outer, '/sbin/launchd']);
    expect(held(ancestorsIn(ps, 40))).toBe(true);
    // Another workspace's lock is a wait, not this run's hold.
    expect(held(ancestorsIn(`${ps}\n   60     1 bun e2e-check.ts`, 60))).toBe(false);
    expect(held(['bun e2e-check.ts', outer])).toBe(true);
    expect(held(['/usr/bin/flock /private/tmp/bible-tools-e2e.lock bun x'])).toBe(true);
    expect(held(['flock -w 30 /tmp/bible-tools-e2e.lock bun x'])).toBe(true);
    expect(held(['lockf -k -t 60 /tmp/bible-tools-e2e.lock bun x'])).toBe(true);
    expect(held(['lockf -k /tmp/bible-tools-gate.lock bun run gate', '-zsh'])).toBe(false);
  });

  test('only the locker holds the lock, and only on that very file', () => {
    const lock = '/tmp/bible-tools-e2e.lock';
    const real = (path: string) => path.replace(/^\/tmp\//, '/private/tmp/');
    const held = (commands: ReadonlyArray<string>) => heldByAncestor(commands, lock, real);
    // A shell whose script names the lock is not the lock: the lockf it starts would be an ancestor of its own.
    expect(
      held([
        "zsh -c 'cd packages/film && lockf -k /tmp/bible-tools-e2e.lock bun run test:e2e:check'",
      ]),
    ).toBe(false);
    expect(held(['bun run notes lockf /tmp/bible-tools-e2e.lock'])).toBe(false);
    // A lock of the same name elsewhere is another lock.
    expect(held(['lockf -k /Users/cvr/tmp/bible-tools-e2e.lock bun run test:e2e:check'])).toBe(
      false,
    );
    expect(held(['flock /tmp/bible-tools-e2e.lock.old bun x'])).toBe(false);
    expect(lockedBy('/usr/bin/lockf -k -t 5 /tmp/x.lock bun x')).toEqual(
      Option.some('/tmp/x.lock'),
    );
    expect(lockedBy('flock --wait=5 /tmp/x.lock bun x')).toEqual(Option.some('/tmp/x.lock'));
    expect(lockedBy('flock --timeout 5 -E 3 /tmp/x.lock bun x')).toEqual(
      Option.some('/tmp/x.lock'),
    );
    expect(lockedBy('lockf')).toEqual(Option.none());
    expect(lockedBy('blockfoo /tmp/x.lock')).toEqual(Option.none());
  });
});

describe('the verdict file', () => {
  test('leads with what blocks, then the failures, the blocking first, each with its reruns', () => {
    const md = verdictMarkdown({
      log: 'tmp/e2e/run.log',
      base: Option.some({ path: 'tmp/e2e/base.log', reruns: false }),
      exit: 1,
      seconds: 612,
      load: '3.1 on 12 cores',
      finished: true,
      judged: [
        {
          failure: { file: Option.some('e2e/a.dom.test.ts'), name: 'a > loaded', whole: false },
          alone: ['pass', 'pass', 'pass'],
          verdict: 'green-alone',
        },
        {
          failure: {
            file: Option.some('e2e/b.dom.test.ts'),
            name: 'b > broken | badly',
            whole: false,
          },
          alone: ['fail', 'fail', 'fail'],
          verdict: 'unit-caused',
        },
        {
          failure: { file: Option.none(), name: 'c > old', whole: false },
          alone: ['fail', 'fail', 'pass'],
          verdict: 'base',
        },
      ],
    });
    expect(md.split('\n').slice(0, 13)).toEqual([
      '# e2e verdict: blocked: 1 unit-caused',
      '',
      '- log: `tmp/e2e/run.log` (exit 1, 612 s)',
      '- base: `tmp/e2e/base.log` (its log only: no rerun known)',
      '- load: 3.1 on 12 cores',
      '- failures: 3: unit-caused 1, unresolved 0, green-alone 1, base 1',
      '',
      '| verdict | file | failure | alone ×3 |',
      '| --- | --- | --- | --- |',
      '| unit-caused | e2e/b.dom.test.ts | b > broken \\| badly | fail fail fail |',
      '| green-alone | e2e/a.dom.test.ts | a > loaded | pass pass pass |',
      '| base | ? | c > old | fail fail pass |',
      '',
    ]);
  });

  test('says the load the suite started at, how long the check waited for it, and whether it fell', () => {
    expect(loadWords({ load: 3.14, cores: 12, waited: 0 })).toBe('3.1 on 12 cores at the start');
    expect(loadWords({ load: 11.9, cores: 12, waited: 95 })).toBe(
      '11.9 on 12 cores at the start, after waiting 95 s',
    );
    expect(loadWords({ load: 30, cores: 12, waited: 1200 })).toBe(
      '30.0 on 12 cores at the start, after waiting 1200 s, still above the core count: ran anyway',
    );
  });

  test('a suite that never finished is said, and blocks', () => {
    const md = verdictMarkdown({
      log: 'l',
      base: Option.none(),
      exit: 1,
      seconds: 1,
      load: '1 on 12 cores',
      finished: false,
      judged: [],
    });
    expect(md).toStartWith('# e2e verdict: blocked: the suite never finished\n');
    expect(md).toContain('- blocks: the suite never finished: bun printed no `Ran N tests` line');
  });
});
