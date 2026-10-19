// `bun run test:budget` over a stand-in turbo, as a shared machine runs it:
// the run's own summary whole, missing or truncated, and other writers'
// summaries (another budget run, a hand-run turbo) landing in the same
// `.turbo/runs` before, during or after it, at turbo's exit 0 and 1. A run
// never reports a time from a summary it did not write, never removes one,
// and measures nothing when its own summary cannot be read, at any exit: it
// fails, and names the workspace's exit with no time.
// `TEST_BUDGET_SEED=<n>` replays the generated cases of a failing seed.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, test } from 'bun:test';
import {
  Clock,
  Config,
  Effect,
  Fiber,
  FileSystem,
  Option,
  Path,
  Schedule,
  Schema,
  Stream,
} from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

/** What the run's own turbo leaves of its summary. */
type Own =
  | 'whole' // written, and its `Summary:` line printed
  | 'no-line' // not written, no `Summary:` line (turbo 2.11.7 when the write fails, exit 0)
  | 'line-no-file' // the `Summary:` line printed, the file gone (another writer removed it)
  | 'truncated' // written in part, its line printed
  | 'no-task' // whole, but without `x#test` (a `test` that never ran)
  | 'two-lines' // whole, and its `Summary:` line printed twice
  | 'outside'; // whole, but written outside `.turbo/runs`, and that path printed

/** Another writer's summary: which workspaces it names, and when it lands beside the run. */
interface Foreign {
  readonly file: string;
  readonly names: 'same' | 'other' | 'both';
  readonly when: 'before' | 'during-before-own' | 'during-after-own' | 'after';
  readonly ms: number;
}

interface Case {
  readonly label: string;
  readonly own: Own;
  readonly exit: 0 | 1;
  readonly ownMs: number;
  readonly foreign: ReadonlyArray<Foreign>;
}

const OWN_FILE = 'own.json';
/** Where the `outside` case writes its summary, relative to the scratch root. */
const OUTSIDE_DIR = 'elsewhere';

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const summary = (tasks: ReadonlyArray<string>, ms: number) =>
  json({
    tasks: tasks.map((taskId) => ({
      taskId,
      execution: { startTime: 1_000, endTime: 1_000 + ms, exitCode: 0 },
    })),
  });

const NAMED: Record<Foreign['names'], ReadonlyArray<string>> = {
  same: ['x#test'],
  other: ['y#test'],
  both: ['x#test', 'y#test'],
};

const foreignSummary = (foreign: Foreign) => summary(NAMED[foreign.names], foreign.ms);

const write = (file: string, body: string) => `printf '%s' '${body}' > .turbo/runs/${file}`;

/** The stand-in: `turbo run test --dry=json` names x and y; a measuring run plays the case. */
const standIn = (each: Case) => {
  const during = (when: Foreign['when']) =>
    each.foreign
      .filter((foreign) => foreign.when === when)
      .map((f) => write(f.file, foreignSummary(f)));
  const whole = summary(['x#test'], each.ownMs);
  const own: Record<Own, ReadonlyArray<string>> = {
    whole: [write(OWN_FILE, whole)],
    'no-line': [],
    'line-no-file': [],
    truncated: [write(OWN_FILE, whole.slice(0, 30))],
    'no-task': [write(OWN_FILE, summary(['x#build'], each.ownMs))],
    'two-lines': [write(OWN_FILE, whole)],
    outside: [`mkdir -p ${OUTSIDE_DIR}`, `printf '%s' '${whole}' > ${OUTSIDE_DIR}/${OWN_FILE}`],
  };
  const printed = `echo "Summary:    $PWD/.turbo/runs/${OWN_FILE}"`;
  const line: Record<Own, ReadonlyArray<string>> = {
    whole: [printed],
    'no-line': [],
    'line-no-file': [printed],
    truncated: [printed],
    'no-task': [printed],
    'two-lines': [printed, printed],
    outside: [`echo "Summary:    $PWD/${OUTSIDE_DIR}/${OWN_FILE}"`],
  };
  const dry = json({
    tasks: [
      { taskId: 'x#test', package: 'x', command: 'bun test' },
      { taskId: 'y#test', package: 'y', command: 'bun test' },
    ],
  });
  return [
    '#!/bin/sh',
    `case "$*" in *--dry=json*) printf '%s\\n' '${dry}'; exit 0;; esac`,
    'mkdir -p .turbo/runs',
    "echo 'x:test: the tests ran'",
    ...during('during-before-own'),
    ...own[each.own],
    ...during('during-after-own'),
    ...line[each.own],
    // The test writes the "after" summaries once this lands (see `run`).
    'touch turbo.exited',
    `exit ${each.exit}`,
    '',
  ].join('\n');
};

const text = (stream: Stream.Stream<Uint8Array, unknown>) =>
  Stream.mkString(Stream.decodeText(stream));

/** A run of a copy of the script in a scratch repository, measuring x over the stand-in. */
const run = (each: Case) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: 'test-budget-' });
    const src = path.join(root, 'packages', 'scripts', 'src');
    yield* fs.makeDirectory(src, { recursive: true });
    yield* fs.copyFile(
      path.join(import.meta.dir, 'test-budget.ts'),
      path.join(src, 'test-budget.ts'),
    );
    yield* fs.copy(path.join(import.meta.dir, 'test-budget'), path.join(src, 'test-budget'));
    yield* fs.symlink(
      path.join(import.meta.dir, '..', 'node_modules'),
      path.join(root, 'packages', 'scripts', 'node_modules'),
    );
    const bin = path.join(root, 'bin');
    yield* fs.makeDirectory(path.join(root, '.turbo', 'runs'), { recursive: true });
    yield* fs.makeDirectory(bin);
    yield* fs.writeFileString(path.join(bin, 'turbo'), standIn(each));
    yield* fs.chmod(path.join(bin, 'turbo'), 0o755);
    for (const foreign of each.foreign.filter((f) => f.when === 'before'))
      yield* fs.writeFileString(
        path.join(root, '.turbo', 'runs', foreign.file),
        foreignSummary(foreign),
      );
    // Another writer lands "after" from outside the run's process group (which
    // ends with turbo): once turbo exits, while the script reads and cleans up.
    const after = each.foreign.filter((foreign) => foreign.when === 'after');
    const writer = yield* Effect.forkScoped(
      Effect.gen(function* () {
        if (after.length === 0) return;
        yield* fs.exists(path.join(root, 'turbo.exited')).pipe(
          Effect.filterOrFail((exited) => exited),
          Effect.retry({ schedule: Schedule.spaced('1 millis'), times: 10_000 }),
        );
        for (const foreign of after)
          yield* fs.writeFileString(
            path.join(root, '.turbo', 'runs', foreign.file),
            foreignSummary(foreign),
          );
      }),
    );
    const PATH = yield* Config.String('PATH');
    const child = yield* spawner.spawn(
      ChildProcess.make('bun', [path.join(src, 'test-budget.ts'), 'x'], {
        cwd: root,
        env: { PATH: `${bin}:${PATH}` },
        extendEnv: true,
        stdin: 'ignore',
        forceKillAfter: '5 seconds',
      }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [text(child.stdout), text(child.stderr), child.exitCode],
      { concurrency: 3 },
    );
    yield* Fiber.join(writer);
    const left = new Set(yield* fs.readDirectory(path.join(root, '.turbo', 'runs')));
    const outsideLeft = yield* fs.exists(path.join(root, OUTSIDE_DIR, OWN_FILE));
    return { stdout, stderr, code: Number(code), left, outsideLeft };
  }).pipe(Effect.scoped);

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Every way the run breaks the rule in `each`; none when it holds. */
const violations = (
  each: Case,
  result: {
    stdout: string;
    stderr: string;
    code: number;
    left: ReadonlySet<string>;
    outsideLeft: boolean;
  },
) => {
  const found: Array<string> = [];
  const times = [...result.stdout.matchAll(/^\s+(\d+\.\d s) {2}x$/gm)].map((match) => match[1]);
  const readable = each.own === 'whole';
  for (const foreign of each.foreign) {
    if (times.includes(seconds(foreign.ms)))
      found.push(`reports ${seconds(foreign.ms)}, the time of ${foreign.file}, another writer's`);
    if (!result.left.has(foreign.file)) found.push(`removed ${foreign.file}, another writer's`);
  }
  if (!result.stdout.includes('x:test: the tests ran'))
    found.push("does not forward turbo's output");
  if (readable) {
    if (times.join() !== seconds(each.ownMs))
      found.push(`reports [${times.join()}], not its own ${seconds(each.ownMs)}`);
    if (result.left.has(OWN_FILE)) found.push('leaves its own summary');
    if (result.code !== each.exit) found.push(`exits ${result.code}, not ${each.exit}`);
    return found;
  }
  if (result.code !== 1) found.push(`exits ${result.code} with its own summary unreadable`);
  if (times.length > 0) found.push(`reports [${times.join()}] with no summary of its own`);
  if (!new RegExp(`^\\s+no time {2}x: exit ${each.exit}\\b`, 'm').test(result.stdout))
    found.push(`names no exit ${each.exit} with no time for x`);
  const unread: ReadonlyArray<Own> = ['truncated', 'no-task', 'two-lines'];
  if (unread.includes(each.own) && !result.left.has(OWN_FILE))
    found.push('removes an own summary it could not read');
  if (each.own === 'outside' && !result.outsideLeft)
    found.push('removes a summary outside .turbo/runs');
  return found;
};

/** Runs each case and holds that none breaks the rule. */
const check = (cases: Effect.Effect<ReadonlyArray<Case>>) =>
  Effect.runPromise(
    Effect.flatMap(cases, (all) =>
      Effect.forEach(
        all,
        (each) =>
          Effect.map(run(each), (result) =>
            violations(each, result).map((violation) => `${each.label}: ${violation}`),
          ),
        { concurrency: 8 },
      ),
    ).pipe(
      Effect.map((found) => expect(found.flat()).toEqual([])),
      Effect.provide(BunServices.layer),
    ),
  );

/** mulberry32: a small seeded generator, so a failing seed can be named and replayed. */
const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const OWNS: ReadonlyArray<Own> = [
  'whole',
  'no-line',
  'line-no-file',
  'truncated',
  'no-task',
  'two-lines',
  'outside',
];
const NAMES: ReadonlyArray<Foreign['names']> = ['same', 'other', 'both'];
const WHENS: ReadonlyArray<Foreign['when']> = [
  'before',
  'during-before-own',
  'during-after-own',
  'after',
];

/** `count` cases: each own summary and exit, with zero to four foreign summaries of any kind and time. */
const generate = (seed: number, count: number): ReadonlyArray<Case> => {
  const next = random(seed);
  const pick = <A>(items: ReadonlyArray<A>): A => items[Math.floor(next() * items.length)] as A;
  return Array.from({ length: count }, (_, index) => {
    const own = OWNS[index % OWNS.length] as Own;
    const exit = (Math.floor(index / OWNS.length) % 2) as 0 | 1;
    const foreign = Array.from({ length: Math.floor(next() * 5) }, (_, k) => ({
      file: `foreign-${k}.json`,
      names: pick(NAMES),
      when: pick(WHENS),
      ms: 20_000 + k * 1_000,
    }));
    const label = `seed ${seed} case ${index} (own ${own}, exit ${exit}, foreign ${foreign.map((f) => `${f.names}/${f.when}`).join(' ') || 'none'})`;
    return {
      label,
      own,
      exit,
      ownMs: 1_000 + Math.floor(next() * 80) * 100,
      foreign,
    };
  });
};

const fixed = (label: string, own: Own, exit: 0 | 1, foreign: ReadonlyArray<Foreign>): Case => ({
  label,
  own,
  exit,
  ownMs: 3_400,
  foreign,
});

const sameDuring: Foreign = {
  file: 'foreign-0.json',
  names: 'same',
  when: 'during-before-own',
  ms: 7_000,
};

/** The seed of the generated cases: `TEST_BUDGET_SEED` when set, else the clock. */
const seed = Effect.gen(function* () {
  const given = yield* Config.option(Config.Int('TEST_BUDGET_SEED'));
  return yield* Option.match(given, {
    onNone: () => Clock.currentTimeMillis,
    onSome: (value) => Effect.succeed(value),
  });
}).pipe(Effect.orDie);

describe("test:budget's run summaries on a shared machine", () => {
  test(
    "another workspace's summary written during the run is left, and the run reads its own",
    () =>
      check(
        Effect.succeed([
          fixed('other workspace during', 'whole', 0, [{ ...sameDuring, names: 'other' }]),
        ]),
      ),
    30_000,
  );

  test(
    "a second run of the same workspace beside it leaves the run its own time and the other run's file",
    () => check(Effect.succeed([fixed('same workspace during', 'whole', 0, [sameDuring])])),
    30_000,
  );

  test(
    "a run whose own summary is missing, truncated or without x#test takes no other run's, at exit 0 and 1",
    () =>
      check(
        Effect.succeed(
          ([0, 1] as const).flatMap((exit) => [
            fixed(`missing, exit ${exit}`, 'no-line', exit, [sameDuring]),
            fixed(`line, no file, exit ${exit}`, 'line-no-file', exit, [sameDuring]),
            fixed(`truncated, exit ${exit}`, 'truncated', exit, [sameDuring]),
            fixed(`no task, exit ${exit}`, 'no-task', exit, [sameDuring]),
          ]),
        ),
      ),
    30_000,
  );

  test(
    'a run whose turbo prints two summary paths, or one outside .turbo/runs, measures and removes nothing',
    () =>
      check(
        Effect.succeed(
          ([0, 1] as const).flatMap((exit) => [
            fixed(`two lines, exit ${exit}`, 'two-lines', exit, []),
            fixed(`outside, exit ${exit}`, 'outside', exit, []),
          ]),
        ),
      ),
    30_000,
  );

  test(
    'over generated runs: no foreign time, no foreign file removed, nothing measured without its own summary',
    () => check(Effect.map(seed, (each) => generate(each, 30))),
    30_000,
  );
});
