/**
 * `bun run promise:census`: holds the promise check (`./promise.ts`) to every
 * way the email list's promise was lost before (`docs/lessons.md`
 * `email-cadence-limits`, `email-promise-found-by-phrase`,
 * `email-promise-read-in-sources`). Each case injects one into a copy of the
 * app's sources, builds the copy as the gate builds the app, runs the check
 * there, and passes only when the check fails and names what was injected.
 * A case whose words the sources no longer hold fails too, so no case goes
 * stale unseen. The gate runs it after the check.
 *
 *   bun run promise:census    # prints `promise-census <case> red` per case; exits 1 when one is not
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Data, Effect, FileSystem, Path, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

/** One way the promise was lost: the words put in a source file, and what the check must say of it. */
interface Case {
  readonly name: string;
  readonly file: string;
  readonly find: string;
  readonly put: string;
  readonly said: ReadonlyArray<string>;
}

const CONFIRMED = 'Thank you. We will send you ${PROMISE}.';
const LABEL = '      Or get them by email\n';
const LEAVE_ANY_TIME = "'You can leave at any time, from the link in any of our emails.'";

/** The census: every trigger of the promise's findings, rounds 2 to 4 of `ftb-copy`. */
const CASES: ReadonlyArray<Case> = [
  {
    name: 'r2-M1 the confirmed page drops "and nothing else"',
    file: 'src/ui/mail.tsx',
    find: `\`${CONFIRMED}\``,
    put: "'Thank you. We will email you when each new film is out.'",
    said: ['dist/subscribe/confirmed.html: unheld: We will email you when each new film is out.'],
  },
  {
    name: 'r2-M1 the confirmed page drops the promise whole',
    file: 'src/ui/mail.tsx',
    find: `\`${CONFIRMED}\``,
    put: "'Thank you.'",
    said: ['dist/subscribe/confirmed.html: states the promise 0 times, not 1'],
  },
  {
    name: 'r3-F1 the confirmed page drops "each new film"',
    file: 'src/ui/mail.tsx',
    find: `\`${CONFIRMED}\``,
    put: "'Thank you. We will email you when a new film is out.'",
    said: ['dist/subscribe/confirmed.html: unheld: We will email you when a new film is out.'],
  },
  {
    name: 'r3-F1 the film letter says "one email per film"',
    file: 'src/mail/letters.ts',
    find: 'which sends ${PROMISE}.`',
    put: 'which sends one email per film.`',
    said: [
      'letter film path/00 text: unheld: You get this because you joined the First the Blade list, which sends one email per film.',
      'letter film path/00 html: unheld: You get this because you joined the First the Blade list, which sends one email per film.',
    ],
  },
  {
    name: 'r4-F1 a cadence with no mail word',
    file: 'src/ui/mail.tsx',
    find: LEAVE_ANY_TIME,
    put: "'We will be in touch every week. A new film reaches you every Friday. A note every week. Look for us here each Friday.'",
    said: [
      'dist/subscribe/confirmed.html: unheld: We will be in touch every week.',
      'dist/subscribe/confirmed.html: unheld: Look for us here each Friday.',
      'dist/subscribe/confirmed.html: unheld: A new film reaches you every Friday.',
      'dist/subscribe/confirmed.html: unheld: A note every week.',
    ],
  },
  {
    name: 'r4-F1 "Emails: weekly"',
    file: 'src/ui/mail.tsx',
    find: LABEL,
    put: '      Emails: weekly\n',
    said: ['dist/index.html: unheld: Emails: weekly'],
  },
  {
    name: 'r4-F1 "EMAIL WEEKLY"',
    file: 'src/ui/mail.tsx',
    find: LABEL,
    put: '      EMAIL WEEKLY\n',
    said: ['dist/index.html: unheld: EMAIL WEEKLY'],
  },
  {
    name: 'r4-F1 "Email · weekly"',
    file: 'src/ui/mail.tsx',
    find: LABEL,
    put: '      Email · weekly\n',
    said: ['dist/index.html: unheld: Email · weekly'],
  },
  {
    name: 'r4-F1 a cadence split by a JSX expression',
    file: 'src/ui/mail.tsx',
    find: LABEL,
    put: '      Email {"weekly"}\n',
    said: ['dist/index.html: unheld: Email weekly'],
  },
  {
    name: 'r4-F1 a cadence on a thumbnail',
    file: 'kit/draw.ts',
    find: "lines: ['You did it.']",
    put: "lines: ['We email you weekly.']",
    said: ['kit/out/thumb-court.png: unheld: We email you weekly.'],
  },
  {
    name: 'r4-F2 the form binds a PROMISE of its own',
    file: 'src/ui/mail.tsx',
    find: "import { PROMISE } from '../mail/promise.ts';",
    put: "const PROMISE = 'a note every week';",
    said: [
      'dist/index.html: unheld: We send you a note every week.',
      'dist/subscribe/confirmed.html: unheld: We will send you a note every week.',
    ],
  },
  {
    name: 'r4-F2 the privacy page binds a PROMISE of its own',
    file: 'src/views.tsx',
    find: "import { PROMISE } from './mail/promise.ts';",
    put: "const PROMISE = 'news from us now and then';",
    said: ['dist/privacy.html: unheld: We use it to send you news from us now and then.'],
  },
];

/** What a copy of the app needs to build and to run the check. */
const COPIED = [
  'src',
  'public',
  'kit',
  'scripts',
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
];

/** Cases run at once, each building its own copy. */
const CONCURRENCY = 4;

class CaseFailed extends Data.TaggedError('CaseFailed')<{ readonly reason: string }> {}

class CensusMissed extends Data.TaggedError('CensusMissed')<{ readonly missed: number }> {
  override get message() {
    return `${this.missed} case(s) of the promise's census did not turn the check red`;
  }
}

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

/** A command's output, stdout then stderr, and its exit code. */
const exec = (command: string, args: ReadonlyArray<string>, cwd: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make(command, args, { cwd, forceKillAfter: '5 seconds' }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [text(child.stdout), text(child.stderr), child.exitCode],
      { concurrency: 3 },
    );
    return { output: `${stdout}${stderr}`, code: Number(code) };
  }).pipe(Effect.scoped);

/** One case, in its own copy of the app under the repo's `tmp/` (two levels down, as the app is, so its tsconfig's `extends` holds). */
const runCase = (app: string, scratch: string, found: Case) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const copy = yield* fs.makeTempDirectoryScoped({
      directory: scratch,
      prefix: 'ftb-promise-census-',
    });
    yield* Effect.forEach(COPIED, (entry) =>
      fs.copy(path.join(app, entry), path.join(copy, entry)),
    );
    const file = path.join(copy, found.file);
    const source = yield* fs.readFileString(file);
    const times = source.split(found.find).length - 1;
    if (times !== 1) {
      return yield* new CaseFailed({
        reason: `stale: ${found.file} holds its words ${times} times, not once`,
      });
    }
    yield* fs.writeFileString(
      file,
      source.replace(found.find, () => found.put),
    );
    const build = yield* exec('bun', ['run', 'build'], copy);
    if (build.code !== 0) {
      return yield* new CaseFailed({ reason: `the build failed:\n${build.output}` });
    }
    const check = yield* exec('bun', ['scripts/promise.ts'], copy);
    const unsaid = found.said.filter((line) => !check.output.includes(`promise ${line}`));
    if (check.code === 0 || unsaid.length > 0) {
      return yield* new CaseFailed({
        reason: `the check exited ${check.code} and did not say:\n${unsaid.join('\n')}\nit said:\n${check.output}`,
      });
    }
  }).pipe(Effect.scoped);

const census = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const app = path.dirname(import.meta.dir);
  const scratch = path.join(app, '..', '..', 'tmp');
  yield* fs.makeDirectory(scratch, { recursive: true });
  const results = yield* Effect.forEach(
    CASES,
    (found) =>
      runCase(app, scratch, found).pipe(
        Effect.as(`promise-census ${found.name}: red`),
        Effect.catchTag('CaseFailed', (failed) =>
          Effect.succeed(`promise-census ${found.name}: NOT RED, ${failed.reason}`),
        ),
      ),
    { concurrency: CONCURRENCY },
  );
  yield* Effect.forEach(results, (line) => Console.log(line));
  const missed = results.filter((line) => !line.endsWith(': red')).length;
  if (missed > 0) return yield* new CensusMissed({ missed });
});

census.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
