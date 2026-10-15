// What `bun run test:e2e:check` reads and writes, pure: the failures of an
// e2e log (bun's own output, run here or in CI: a `gh run view --log-failed`
// file reads as well), each a failed case, a worker that crashed with its
// file, or an error bun caught between tests; whether the suite finished;
// the command that reruns one failure alone; what a rerun showed; and the
// verdict on each failure, against what the base showed of it.
//
// Every failure is rerun alone three times. Green in all three, it is
// "green alone": it failed only beside the rest of the suite, which the
// reruns cannot tell apart as load or order (a case another left running).
// Red alone, it is the base's only when the base's own check saw the same
// failure red alone; it is the unit's when the base passed it (its suite
// finished without it, or its check saw it green alone); anything else is
// unresolved. A unit-caused or unresolved failure, or a suite that never
// finished or failed naming nothing, blocks.

import { Array as Arr, Match, Option, Schema } from 'effect';

/**
 * A failure: its file, when the log names it; its name, as bun prints a case
 * (`describe > case`) or what happened to the file; and whether a rerun runs
 * the file whole (a worker that crashed, an error between tests) rather than
 * the case alone.
 */
export interface Failure {
  readonly file: Option.Option<string>;
  readonly name: string;
  readonly whole: boolean;
}

/** CI's line prefix (`job\tstep\t<timestamp> `), and its group markers. */
const CI_PREFIX = /^[^\t\n]*\t[^\t\n]*\t\d{4}-\d\d-\d\dT[\d:.]+Z ?/;
const CI_GROUP = /^##\[(?:group|endgroup)\]/;
// oxlint-disable-next-line no-control-regex -- the colours bun prints are escape sequences
const ANSI = /\u001b\[[0-9;]*m/g;

/** A file's header, as bun opens its cases: `e2e/lab/shell.dom.test.ts:`. */
const HEADER = /^(\S+\.test\.tsx?):$/;
/** A failed case: `(fail) name [12.3ms]` locally, `✗ name [12.3ms]` in CI. */
const FAILED = /^(?:\(fail\)|✗) (.+?)(?: \[[\d.]+m?s\])?$/;
/** A worker that died with its file: the file is the failure. */
const CRASHED = /^(\S+\.test\.tsx?) \(worker crashed: \w+\)$/;
/** The summary of failures bun repeats at the end of a parallel run: its names add none. */
const SUMMARY = /^\d+ tests? failed:$/;
/** An error bun caught outside any case, in the file whose header is above it. */
const BETWEEN = /^# Unhandled error between tests$/;
/** How many such errors bun counted, in its summary. */
const ERRORS = /^\s*(\d+) errors?$/;
/** The line bun ends a finished run with. */
const RAN = /^Ran (\d+) tests? across \d+ files?\./m;

/** What a failure caught between tests is called. */
export const BETWEEN_TESTS = 'an error between tests';
/** What an error bun counted, but the log does not place in a file, is called. */
const UNPLACED = 'an error bun counted that the log does not place';

/** `values` where `holds`, else nothing: a list's optional part. */
const when = <A>(holds: boolean, ...values: ReadonlyArray<A>): ReadonlyArray<A> =>
  values.filter(() => holds);

const clean = (line: string) => line.replace(CI_PREFIX, '').replace(CI_GROUP, '').replace(ANSI, '');
const cleaned = (text: string) => text.split('\n').map(clean);

/** The first group `pattern` captures in `line`, if it matches. */
const captured = (pattern: RegExp, line: string): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(pattern.exec(line)), (m) => Option.fromNullishOr(m[1]));

/** Whether `a` and `b` are the same failure: the same name and kind, and the same file where both name one. */
const same = (a: Failure, b: Failure): boolean =>
  a.name === b.name &&
  a.whole === b.whole &&
  Option.getOrElse(
    Option.zipWith(a.file, b.file, (x, y) => x === y),
    () => true,
  );

/**
 * The failures of `log`, each once, in the order they first failed: each
 * failed case under the file bun printed above it, each crashed worker's
 * file, each error caught between tests in its file, and, when bun counted
 * more errors than the log places, one unplaced failure for each of the rest.
 * The summary bun repeats at the end of a parallel run adds no case.
 */
export const failuresIn = (log: string): ReadonlyArray<Failure> => {
  const found: Array<Failure> = [];
  const add = (failure: Failure) => {
    if (!found.some((f) => same(f, failure))) found.push(failure);
  };
  let file = Option.none<string>();
  let summary = false;
  let counted = 0;
  let placed = 0;
  for (const line of cleaned(log)) {
    file = Option.orElse(captured(HEADER, line), () => file);
    if (SUMMARY.test(line)) summary = true;
    if (BETWEEN.test(line)) {
      placed += 1;
      add({ file, name: BETWEEN_TESTS, whole: true });
    }
    counted = Option.getOrElse(Option.map(captured(ERRORS, line), Number), () => counted);
    for (const name of Option.toArray(captured(FAILED, line))) {
      const crashed = captured(CRASHED, name);
      if (Option.isSome(crashed)) add({ file: crashed, name, whole: true });
      else if (!summary) add({ file, name, whole: false });
      else if (!found.some((f) => f.name === name))
        add({ file: Option.none(), name, whole: false });
    }
  }
  const unplaced = counted - placed;
  for (let k = 1; k <= unplaced; k += 1)
    add({ file: Option.none(), name: `${UNPLACED} (${k} of ${unplaced})`, whole: true });
  return found;
};

/** Whether the suite of `log` finished: bun printed its `Ran N tests across M files` line. */
export const finishedIn = (log: string): boolean => RAN.test(cleaned(log).join('\n'));

/**
 * The flag of the suite that spreads its files over workers, which a rerun
 * alone leaves out: one worker runs the rerun. `--max-concurrency` stays, so a
 * file rerun whole runs no more of its cases at once than the suite did (bun's
 * own default is 20).
 */
const WORKERS = '--parallel';

/**
 * The `bun test -t` pattern that runs `name` alone: bun matches a case by
 * its describe blocks and its own name joined by spaces, where it prints them
 * joined by ` > `.
 */
const casePattern = (name: string): string =>
  `^${name.replaceAll(' > ', ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;

/**
 * The command that reruns `failure` alone, from the suite's own script
 * (`test:e2e`, `bun src/lab/fixtures/run-suite.ts … e2e`): its runner and
 * flags but `--parallel` (as `--parallel=n` or `--parallel n`), so one
 * worker runs it at the suite's own concurrency, on the failure's file, and
 * on the case alone unless the failure is the file's.
 */
export const aloneArgs = (suite: string, failure: Failure): ReadonlyArray<string> => {
  const tokens = suite.split(/\s+/).filter((arg) => arg !== '' && arg !== 'e2e');
  const kept = tokens.filter((arg, i) => {
    const workers = arg === WORKERS || arg.startsWith(`${WORKERS}=`);
    const valueOfWorkers = tokens[i - 1] === WORKERS && /^\d+$/.test(arg);
    return !workers && !valueOfWorkers;
  });
  return [
    ...kept,
    Option.getOrElse(failure.file, () => 'e2e'),
    ...when(!failure.whole, '-t', casePattern(failure.name)),
  ];
};

/** What one rerun alone showed: it passed, it failed, or it ran no test (a filter that matched none, a run cut short). */
export const Run = Schema.Literals(['pass', 'fail', 'none']);
export type Run = typeof Run.Type;

/** A rerun's outcome from its exit code and output. */
export const runOf = (exit: number, output: string): Run =>
  Option.match(
    Option.filter(Option.map(captured(RAN, cleaned(output).join('\n')), Number), (n) => n > 0),
    {
      onNone: (): Run => 'none',
      onSome: (): Run =>
        Match.value(exit).pipe(
          Match.when(0, () => 'pass' as const),
          Match.orElse(() => 'fail' as const),
        ),
    },
  );

/** What a failure is, by its reruns alone and the base's. */
const Verdict = Schema.Literals(['unit-caused', 'unresolved', 'green-alone', 'base']);
type Verdict = typeof Verdict.Type;

const VERDICTS: ReadonlyArray<Verdict> = ['unit-caused', 'unresolved', 'green-alone', 'base'];

/** The verdicts that block. */
const BLOCKING: ReadonlyArray<Verdict> = ['unit-caused', 'unresolved'];

/** One row of the verdict: the failure, its reruns alone, its verdict. */
export interface Judged {
  readonly failure: Failure;
  readonly alone: ReadonlyArray<Run>;
  readonly verdict: Verdict;
}

/**
 * What the base showed: the failures its suite logged, whether that suite
 * finished, and, when the base's log is a check's, what its reruns alone saw.
 */
export interface Base {
  readonly failed: ReadonlyArray<Failure>;
  readonly finished: boolean;
  readonly alone: ReadonlyArray<Judged>;
}

const red = (runs: ReadonlyArray<Run>) => runs.includes('fail');
const green = (runs: ReadonlyArray<Run>) =>
  Arr.isReadonlyArrayNonEmpty(runs) && runs.every((run) => run === 'pass');

/**
 * A failure's verdict from its reruns alone here and what the base showed:
 * green alone; else red alone at the base too (`base`); else passed at the
 * base, by its check's reruns or its finished suite (`unit-caused`); else
 * `unresolved`, as is any failure that could not be rerun alone.
 */
export const verdictOf = (
  failure: Failure,
  alone: ReadonlyArray<Run>,
  base: Option.Option<Base>,
): Verdict => {
  if (!Arr.isReadonlyArrayNonEmpty(alone) || alone.includes('none')) return 'unresolved';
  if (green(alone)) return 'green-alone';
  const atBase = Option.map(base, (b) => ({
    rerun: Option.map(
      Arr.findFirst(b.alone, (j) => same(j.failure, failure)),
      (j) => j.alone,
    ),
    passed: b.finished && !b.failed.some((f) => same(f, failure)),
  }));
  if (Option.exists(atBase, (b) => Option.exists(b.rerun, red))) return 'base';
  if (Option.exists(atBase, (b) => b.passed || Option.exists(b.rerun, green))) return 'unit-caused';
  return 'unresolved';
};

/** What a check keeps beside its log (`<log>.verdict.json`), for a later check to read as its base. */
export const Recorded = Schema.Struct({
  finished: Schema.Boolean,
  judged: Schema.Array(
    Schema.Struct({
      file: Schema.NullOr(Schema.String),
      name: Schema.String,
      whole: Schema.Boolean,
      alone: Schema.Array(Run),
      verdict: Verdict,
    }),
  ),
});
export type Recorded = typeof Recorded.Type;

/** A check's record of its run. */
export const recordOf = (finished: boolean, judged: ReadonlyArray<Judged>): Recorded => ({
  finished,
  judged: judged.map((j) => ({
    file: Option.getOrNull(j.failure.file),
    name: j.failure.name,
    whole: j.failure.whole,
    alone: j.alone,
    verdict: j.verdict,
  })),
});

/** The base as its check recorded it. */
export const baseOfRecord = (record: Recorded): Base => {
  const judged = record.judged.map((j) => ({
    failure: { file: Option.fromNullishOr(j.file), name: j.name, whole: j.whole },
    alone: j.alone,
    verdict: j.verdict,
  }));
  return { failed: judged.map((j) => j.failure), finished: record.finished, alone: judged };
};

/** The base as its log alone shows it, no rerun known. */
export const baseOfLog = (log: string): Base => ({
  failed: failuresIn(log),
  finished: finishedIn(log),
  alone: [],
});

/** The command lines of `pid`'s ancestors, nearest first, from `ps -A -o pid= -o ppid= -o command=`. */
export const ancestorsIn = (ps: string, pid: number): ReadonlyArray<string> => {
  const table = new Map(
    ps
      .split('\n')
      .flatMap((line) =>
        Option.toArray(
          Option.map(
            Option.fromNullishOr(/^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)),
            (m) => [Number(m[1]), { ppid: Number(m[2]), command: m[3] ?? '' }] as const,
          ),
        ),
      ),
  );
  const commands: Array<string> = [];
  let at = Option.flatMap(Option.fromUndefinedOr(table.get(pid)), (p) =>
    Option.fromUndefinedOr(table.get(p.ppid)),
  );
  while (Option.isSome(at) && commands.length < table.size) {
    commands.push(at.value.command);
    at = Option.fromUndefinedOr(table.get(at.value.ppid));
  }
  return commands;
};

/**
 * Whether one of `commands` (this process's ancestors' command lines) holds
 * `lock` already: a `flock` or `lockf` on a file of its name. A check run
 * inside one runs in that hold, rather than wait on itself.
 */
export const heldByAncestor = (commands: ReadonlyArray<string>, lock: string): boolean => {
  const name = lock.split('/').at(-1) ?? lock;
  return commands.some(
    (command) => /(?:^|[\s/])(?:flock|lockf)\s/.test(command) && command.includes(name),
  );
};

/** The load a suite started at, in words: the cores, how long the check waited for it, and whether it fell. */
export const loadWords = (host: {
  readonly load: number;
  readonly cores: number;
  readonly waited: number;
}): string =>
  [
    `${host.load.toFixed(1)} on ${host.cores} cores at the start`,
    ...when(host.waited > 0, `after waiting ${host.waited} s`),
    ...when(host.load > host.cores, 'still above the core count: ran anyway'),
  ].join(', ');

/** What blocks the suite as a whole: it never finished, or it failed and named nothing. */
const suiteProblems = (input: {
  readonly exit: number;
  readonly finished: boolean;
  readonly judged: ReadonlyArray<Judged>;
}): ReadonlyArray<string> => [
  ...when(
    !input.finished,
    'the suite never finished: bun printed no `Ran N tests` line, so the cases it never reached are not judged',
  ),
  ...when(
    input.finished && input.exit !== 0 && input.judged.length === 0,
    `the suite exited ${input.exit} and named no failure: see the log`,
  ),
];

/** Whether the verdict blocks: a unit-caused or unresolved failure, or a suite that never finished or named nothing. */
export const blocks = (input: {
  readonly exit: number;
  readonly finished: boolean;
  readonly judged: ReadonlyArray<Judged>;
}): boolean =>
  Arr.isReadonlyArrayNonEmpty(suiteProblems(input)) ||
  input.judged.some((j) => BLOCKING.includes(j.verdict));

/** The reruns alone as the table prints them. */
const aloneCell = (alone: ReadonlyArray<Run>) =>
  Option.match(Option.liftPredicate(alone, Arr.isReadonlyArrayNonEmpty), {
    onNone: () => '—',
    onSome: (runs) => runs.join(' '),
  });

/** The verdict file: what ran, what blocks, then each failure with its class, the blocking first. */
export const verdictMarkdown = (input: {
  readonly log: string;
  readonly base: Option.Option<{ readonly path: string; readonly reruns: boolean }>;
  readonly exit: number;
  readonly seconds: number;
  readonly load: string;
  readonly finished: boolean;
  readonly judged: ReadonlyArray<Judged>;
}): string => {
  const count = (v: Verdict) => input.judged.filter((j) => j.verdict === v).length;
  const rows = VERDICTS.flatMap((v) =>
    input.judged
      .filter((j) => j.verdict === v)
      .map(
        (j) =>
          `| ${v} | ${Option.getOrElse(j.failure.file, () => '?')} | ${j.failure.name.replaceAll('|', '\\|')} | ${aloneCell(j.alone)} |`,
      ),
  );
  const problems = suiteProblems(input);
  const blocking = [
    ...BLOCKING.filter((v) => count(v) > 0).map((v) => `${count(v)} ${v}`),
    ...problems.map((p) => p.split(':')[0] ?? p),
  ];
  return [
    `# e2e verdict: ${Option.match(Option.liftPredicate(blocking, Arr.isReadonlyArrayNonEmpty), {
      onNone: () => 'clear (no unit-caused or unresolved failure)',
      onSome: (b) => `blocked: ${b.join(', ')}`,
    })}`,
    '',
    `- log: \`${input.log}\` (exit ${input.exit}, ${input.seconds} s)`,
    `- base: ${Option.match(input.base, {
      onNone: () => 'none (a failure red alone is unresolved)',
      onSome: (b) =>
        `\`${b.path}\` (${Match.value(b.reruns).pipe(
          Match.when(true, () => "its check's reruns alone"),
          Match.orElse(() => 'its log only: no rerun known'),
        )})`,
    })}`,
    `- load: ${input.load}`,
    `- failures: ${input.judged.length}: ${VERDICTS.map((v) => `${v} ${count(v)}`).join(', ')}`,
    ...problems.map((p) => `- blocks: ${p}`),
    '',
    ...Option.match(Option.liftPredicate(rows, Arr.isReadonlyArrayNonEmpty), {
      onNone: () => ['No case failed.'],
      onSome: (r) => [
        '| verdict | file | failure | alone ×3 |',
        '| --- | --- | --- | --- |',
        ...r,
        '',
        'green-alone: green in all three reruns alone. The suite failed it under load or by order (a case another left running); the reruns do not tell which.',
      ],
    }),
    '',
  ].join('\n');
};
