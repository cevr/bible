/**
 * `verify:doctor`: is this instance worth driving? Read-only checks, in
 * order, failing at the first that does not hold and naming it:
 *
 * - `record`: the root's launch record reads;
 * - `port`: the port is held by the PID the record names;
 * - `head`: the checkout is at the commit the preview was launched at, and
 *   the build is newer than every source and public file;
 * - `answers`: the home and privacy pages answer 200 with the content
 *   policy, and a path that names no page answers 404;
 * - `log`: the preview's log holds no failure;
 * - `outbox`: every letter reads, with its `To:` and `Subject:`;
 * - `audio`: on macOS, no test browser holds the audio output;
 * - `load`: the load average against the core count, which only decides
 *   whether a timing measured now means anything (`timingsValid`).
 *
 * A stage (`--origin`) is checked by `answers` and `load` alone, with GET.
 */
import { type Duration, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { Headers, HttpClient } from 'effect/http';

import { APP_DIR, headOf, listenersOn, readRecord, run } from './instance.ts';
import { type Check, DoctorFailed, type LaunchRecord } from './model.ts';
import { readOutbox } from './outbox.ts';

const fail = (check: string, message: string) => Effect.fail(DoctorFailed.make({ check, message }));

/** What a log line of a failure looks like: an error, a defect, a list step that failed. */
export const FAILURE_LINE =
  /\bERROR\b|\bdefect\b|uncaught|unhandled|\[mail\] \S+\.(?:failed|unsent)/i;

/** The newest change to any file under `dir`, in ms. */
const newestUnder = Effect.fn('Verify.newestUnder')(function* (dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names = yield* fs.readDirectory(dir, { recursive: true });
  const times = yield* Effect.forEach(
    names,
    (name) =>
      Effect.map(fs.stat(path.join(dir, name)), (info) =>
        Option.match(info.mtime, { onNone: () => 0, onSome: (at) => at.getTime() }),
      ),
    { concurrency: 16 },
  );
  return Math.max(0, ...times);
});

/** How long the doctor gives each request. */
export const ANSWER_WITHIN: Duration.Input = '5 seconds';

/** The pages an instance answers, each request under `within`. */
export const answersCheck = Effect.fn('Verify.answersCheck')(function* (
  origin: string,
  within: Duration.Input = ANSWER_WITHIN,
) {
  const client = yield* HttpClient.HttpClient;
  const status = (path: string) =>
    client.get(`${origin}${path}`).pipe(
      Effect.timeout(within),
      Effect.mapError((error) =>
        DoctorFailed.make({ check: 'answers', message: `${path}: ${error.message}` }),
      ),
    );
  const home = yield* status('/');
  if (home.status !== 200) return yield* fail('answers', `/ answered ${home.status}`);
  if (Option.isNone(Headers.get(home.headers, 'content-security-policy')))
    return yield* fail('answers', '/ carries no content-security-policy');
  const privacy = yield* status('/privacy');
  if (privacy.status !== 200) return yield* fail('answers', `/privacy answered ${privacy.status}`);
  const missing = yield* status('/verify-doctor-no-such-page');
  if (missing.status !== 404)
    return yield* fail('answers', `a path with no page answered ${missing.status}, not 404`);
  return `${origin}: / 200 with its content policy, /privacy 200, a missing page 404`;
});

const portCheck = Effect.fn('Verify.portCheck')(function* (record: LaunchRecord) {
  const held = yield* listenersOn(record.port);
  if (!held.includes(record.pid))
    return yield* fail(
      'port',
      `port ${record.port} is held by [${held.join(',')}], not pid ${record.pid}`,
    );
  return `port ${record.port} held by pid ${record.pid}`;
});

const headCheck = Effect.fn('Verify.headCheck')(function* (record: LaunchRecord) {
  const fs = yield* FileSystem.FileSystem;
  const head = yield* headOf();
  if (head !== record.head)
    return yield* fail('head', `checkout at ${head}, preview launched at ${record.head}: relaunch`);
  const built = yield* fs.stat(`${record.dist}/index.html`);
  const builtAt = Option.match(built.mtime, { onNone: () => 0, onSome: (at) => at.getTime() });
  const sources = Math.max(
    yield* newestUnder(`${APP_DIR}/src`),
    yield* newestUnder(`${APP_DIR}/public`),
  );
  if (builtAt < sources)
    return yield* fail(
      'head',
      'a source is newer than the build: run bun run build, then relaunch',
    );
  return `at ${head.slice(0, 9)}, build newer than its sources`;
});

const logCheck = Effect.fn('Verify.logCheck')(function* (record: LaunchRecord) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(record.log);
  const failures = text.split('\n').filter((line) => FAILURE_LINE.test(line));
  if (failures.length > 0)
    return yield* fail('log', `${failures.length} failure lines; first: ${failures[0]}`);
  return `${record.log}: no failure lines`;
});

const outboxCheck = Effect.fn('Verify.outboxCheck')(function* (record: LaunchRecord) {
  const letters = yield* readOutbox(record.outbox);
  const unread = letters.filter((letter) => letter.to === '' || letter.subject === '');
  if (unread.length > 0) return yield* fail('outbox', `${unread[0]?.file} has no To: or Subject:`);
  return `${letters.length} letters, each with To: and Subject:`;
});

/** A test browser holding the audio output plays through the owner's speakers. */
const audioCheck = Effect.fn('Verify.audioCheck')(function* () {
  const result = yield* Effect.option(run('pmset', ['-g', 'assertions']));
  if (Option.isNone(result)) return 'no pmset (not macOS): not checked';
  const holders = result.value.out
    .split('\n')
    .filter((line) => line.includes('audio-out') && /chrom/i.test(line));
  if (holders.length > 0)
    return yield* fail('audio', `a browser holds the audio output: ${holders[0]?.trim()}`);
  return 'no browser holds the audio output';
});

/** The one-minute load and the core count, from sysctl (macOS) or /proc (Linux). */
const loadOf = Effect.fn('Verify.loadOf')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const mac = yield* Effect.option(run('sysctl', ['-n', 'vm.loadavg', 'hw.ncpu']));
  if (Option.isSome(mac) && mac.value.code === 0) {
    const [avg = '', cores = ''] = mac.value.out.split('\n');
    return { load: Number(avg.replace(/[{}]/g, '').trim().split(/\s+/)[0]), cores: Number(cores) };
  }
  const proc = yield* fs.readFileString('/proc/loadavg');
  const { out } = yield* run('nproc', []);
  return { load: Number(proc.split(' ')[0]), cores: Number(out.trim()) };
});

/** A check's detail as it passed, or its failure named as that check. */
const checked = <E extends { readonly message: string }, R>(
  check: string,
  effect: Effect.Effect<string, E, R>,
) =>
  effect.pipe(
    Effect.map((detail): Check => ({ check, detail })),
    Effect.mapError((error) => {
      if (Schema.is(DoctorFailed)(error)) return error;
      return DoctorFailed.make({ check, message: error.message });
    }),
  );

const finish = Effect.fn('Verify.finish')(function* (target: string, checks: ReadonlyArray<Check>) {
  const { load, cores } = yield* loadOf().pipe(
    Effect.mapError((error) => DoctorFailed.make({ check: 'load', message: error.message })),
  );
  const timingsValid = load < cores;
  return {
    ok: true as const,
    target,
    checks: [...checks, { check: 'load', detail: `load ${load} on ${cores} cores` }],
    timingsValid,
  };
});

/** The local preview a root holds, checked in order. */
export const doctorRoot = Effect.fn('Verify.doctorRoot')(function* (root: string) {
  const record = yield* readRecord(root).pipe(
    Effect.mapError((error) => DoctorFailed.make({ check: 'record', message: error.message })),
  );
  const checks: ReadonlyArray<Check> = [
    { check: 'record', detail: `${root}/launch.json reads` },
    yield* checked('port', portCheck(record)),
    yield* checked('head', headCheck(record)),
    yield* checked('answers', answersCheck(record.origin)),
    yield* checked('log', logCheck(record)),
    yield* checked('outbox', outboxCheck(record)),
    yield* checked('audio', audioCheck()),
  ];
  return yield* finish(record.origin, checks);
});

/** A deployed stage, read with GET only. */
export const doctorOrigin = Effect.fn('Verify.doctorOrigin')(function* (origin: string) {
  return yield* finish(origin, [yield* checked('answers', answersCheck(origin))]);
});
