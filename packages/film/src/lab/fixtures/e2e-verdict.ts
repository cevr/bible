// What `bun run test:e2e:check` reads and writes, pure: the failed cases of
// an e2e log (bun's own output, run here or in CI: a `gh run view
// --log-failed` file reads as well), the ones a base log lacks, the command
// that reruns one case alone, and the verdict on each failure. A failure the
// base log holds is the base's. A new one is rerun alone three times: red in
// any of them, it reproduces with nothing else running, so the unit caused
// it; green in all three, it failed only under the suite's load.

import { Array as Arr, Match, Option } from 'effect';

/** A failed case: its file, when the log names it, and its name as bun prints it (`describe > case`). */
interface Failure {
  readonly file: Option.Option<string>;
  readonly name: string;
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

const clean = (line: string) => line.replace(CI_PREFIX, '').replace(CI_GROUP, '').replace(ANSI, '');

/** The first group `pattern` captures in `line`, if it matches. */
const captured = (pattern: RegExp, line: string): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(pattern.exec(line)), (m) => Option.fromNullishOr(m[1]));

/**
 * The failed cases of `log`, each once, in the order they first failed. A
 * case's file is the header bun printed above it; the summary bun repeats
 * at the end names each again, under no header of its own, and adds none.
 */
export const failuresIn = (log: string): ReadonlyArray<Failure> => {
  const found = new Map<string, Failure>();
  let file = Option.none<string>();
  for (const line of log.split('\n').map(clean)) {
    file = Option.orElse(captured(HEADER, line), () => file);
    for (const name of Option.toArray(captured(FAILED, line)))
      if (!found.has(name))
        found.set(name, { file: Option.orElse(captured(CRASHED, name), () => file), name });
  }
  return [...found.values()];
};

/** The failures of `run` that `base` did not have, by name. */
export const newAgainst = (
  run: ReadonlyArray<Failure>,
  base: ReadonlyArray<Failure>,
): ReadonlyArray<Failure> => run.filter((f) => !base.some((b) => b.name === f.name));

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
 * flags, one worker with one case at a time, on the failure's file, and on
 * the case alone unless its worker crashed (the whole file runs again).
 */
export const aloneArgs = (suite: string, failure: Failure): ReadonlyArray<string> => [
  ...suite
    .split(/\s+/)
    .filter((arg) => arg !== '' && arg !== '--parallel' && arg !== 'e2e')
    .filter((arg) => !arg.startsWith('--max-concurrency')),
  Option.getOrElse(failure.file, () => 'e2e'),
  ...Option.match(captured(CRASHED, failure.name), {
    onNone: () => ['-t', casePattern(failure.name)],
    onSome: () => [],
  }),
];

/** What a failure is, by the reruns alone. */
type Verdict = 'unit-caused' | 'load-only' | 'base';

const VERDICTS: ReadonlyArray<Verdict> = ['unit-caused', 'load-only', 'base'];

/** A new failure's verdict from its reruns alone (true: passed). */
export const verdictOf = (alone: ReadonlyArray<boolean>): Verdict =>
  Match.value(Arr.isReadonlyArrayNonEmpty(alone) && alone.every(Boolean)).pipe(
    Match.withReturnType<Verdict>(),
    Match.when(true, () => 'load-only'),
    Match.orElse(() => 'unit-caused'),
  );

/** One row of the verdict: the failure, its reruns alone (none for the base's), its verdict. */
export interface Judged {
  readonly failure: Failure;
  readonly alone: ReadonlyArray<boolean>;
  readonly verdict: Verdict;
}

/** The reruns alone as the table prints them. */
const aloneCell = (alone: ReadonlyArray<boolean>) =>
  Option.match(Option.liftPredicate(alone, Arr.isReadonlyArrayNonEmpty), {
    onNone: () => '—',
    onSome: (runs) => runs.map((pass) => ['fail', 'pass'][Number(pass)]).join(' '),
  });

/** The verdict file: what ran, then each failure with its class, the unit's first. */
export const verdictMarkdown = (input: {
  readonly log: string;
  readonly base: Option.Option<string>;
  readonly exit: number;
  readonly seconds: number;
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
  const caused = count('unit-caused');
  return [
    `# e2e verdict: ${Option.match(
      Option.liftPredicate(caused, (n) => n > 0),
      {
        onNone: () => 'no unit-caused failure',
        onSome: (n) => `${n} unit-caused`,
      },
    )}`,
    '',
    `- log: \`${input.log}\` (exit ${input.exit}, ${input.seconds} s)`,
    `- base: ${Option.match(input.base, { onNone: () => 'none (every failure is new)', onSome: (b) => `\`${b}\`` })}`,
    `- failures: ${input.judged.length} — unit-caused ${caused}, load-only ${count('load-only')}, base ${count('base')}`,
    '',
    ...Option.match(Option.liftPredicate(rows, Arr.isReadonlyArrayNonEmpty), {
      onNone: () => ['No case failed.'],
      onSome: (r) => ['| verdict | file | case | alone ×3 |', '| --- | --- | --- | --- |', ...r],
    }),
    '',
  ].join('\n');
};
