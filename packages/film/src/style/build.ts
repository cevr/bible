// Compile a figure project with the Rive CLI, offline and unsigned
// (`rive --once`: no account, no scripts): write the generated project, run
// the CLI on it, and answer the built file with what the build warned of, its
// problems and its stamp (what it was built from). A film's rig build
// (`righteousness-by-faith/rigs/build.ts`) copies the file and its stamp
// beside its rigs, and holds the committed file to its rigs through the stamp
// (`unbuilt`), as the film's test does on a host with no CLI. Both hold
// first each override its figures carry to the owner's decisions on his
// production's ledger, his words or his pick on that figure (`unsaid`,
// `override.ts`), then each locked figure's print to its lock, and the lock
// to the decision it names (`unlocked`, `lock.ts`). The CLI is `rive` on the
// PATH, or the one `RIVE` names.

import { Config, Crypto, Effect, FileSystem, Schema, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { ProductionFile, decisionsOf } from '../core/production.ts';
import { repoJson } from '../core/schema.ts';
import { type Lock, heldTo } from './lock.ts';
import { type Laid, unbacked } from './override.ts';
import { RULES } from './rules.ts';

/** What the CLI reports as wrong with a project: kept as it prints it. */
const Problems = Schema.Array(Schema.Unknown);

/** What `rive --once --format=json` prints: the built file, what the build warned of, and its problems. */
const Built = Schema.fromJsonString(
  Schema.Struct({
    data: Schema.Struct({ riv: Schema.String, bytes: Schema.Finite }),
    warnings: Schema.Array(Schema.String),
    problems: Schema.optional(Problems),
  }),
);

/** The Rive CLI exited non-zero: what it printed. */
class RiveFailed extends Schema.TaggedError<RiveFailed>()('RiveFailed', {
  step: Schema.String,
  output: Schema.String,
}) {
  override get message() {
    return `${this.step} failed:\n${this.output}`;
  }
}

/** Run the Rive CLI with `args`: its stdout, or `RiveFailed` with all it printed. */
const rive = (step: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const bin = yield* Config.String('RIVE').pipe(Config.withDefault('rive'));
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make(bin, args, { forceKillAfter: '5 seconds' }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [
        Stream.mkString(Stream.decodeText(handle.stdout)),
        Stream.mkString(Stream.decodeText(handle.stderr)),
        handle.exitCode,
      ],
      { concurrency: 3 },
    );
    if (code !== 0) return yield* RiveFailed.make({ step, output: `${stdout}${stderr}` });
    return stdout;
  }).pipe(Effect.scoped);

/** The project `rml` prints, `main` its main artboard: each file the CLI reads, by name. */
const projectOf = (rml: string, main: string) =>
  [
    ['rive.yaml', `name: figures\nmain: ${main}\n`],
    ['figures.rml', rml],
  ] as const;

/** `bytes`' sha256, as lowercase hex. */
const sha256 = Effect.fn('sha256')(function* (bytes: Uint8Array) {
  const crypto = yield* Crypto.Crypto;
  const digest = yield* crypto.digest('SHA-256', bytes);
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
});

/** The digest of the project `rml` and `main` print: each file's name and text, closed by a NUL. */
const projectDigest = (rml: string, main: string) =>
  sha256(
    new TextEncoder().encode(
      projectOf(rml, main)
        .map(([name, text]) => `${name}\0${text}\0`)
        .join(''),
    ),
  );

/**
 * What a committed `.riv` was built from, written beside it by its build
 * alone: the digest of the project its rigs printed, the built file's, and
 * the CLI that compiled the one into the other (`rive --version`).
 */
const StampJson = repoJson(
  Schema.Struct({ project: Schema.String, riv: Schema.String, cli: Schema.String }),
);

/**
 * Write `rml` as the project in `dir` (`rive.yaml` and `figures.rml`), its
 * main artboard `main`, and compile it offline and unsigned (`rive --once`):
 * the built file, its size, what the build warned of, its problems, and its
 * stamp as the repo keeps it (`stamp`, written beside the committed file).
 */
export const compile = Effect.fn('compile')(function* (dir: string, rml: string, main: string) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(dir, { recursive: true });
  yield* Effect.forEach(projectOf(rml, main), ([name, text]) =>
    fs.writeFileString(`${dir}/${name}`, text),
  );
  const printed = yield* rive('rive --once', [dir, '--once', '--quiet', '--format=json']);
  const report = yield* Schema.decodeEffect(Built)(printed.trim());
  const stamp = yield* Schema.encodeEffect(StampJson)({
    project: yield* projectDigest(rml, main),
    riv: yield* sha256(yield* fs.readFile(report.data.riv)),
    cli: (yield* rive('rive --version', ['--version'])).trim(),
  });
  return { ...report.data, warnings: report.warnings, problems: report.problems ?? [], stamp };
});

/**
 * Why the committed `riv` is not the build of the project `rml` and `main`
 * print, read through the stamp its build wrote beside it (`stamp`): none
 * when the project prints as it was built and the file is the one that build
 * wrote. It runs no CLI.
 */
export const unbuilt = Effect.fn('unbuilt')(function* (committed: {
  readonly riv: string;
  readonly stamp: string;
  readonly rml: string;
  readonly main: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(committed.stamp))) return [`${committed.stamp} is missing`];
  const stamp = yield* Schema.decodeEffect(StampJson)(yield* fs.readFileString(committed.stamp));
  const project = yield* projectDigest(committed.rml, committed.main);
  const riv = yield* sha256(yield* fs.readFile(committed.riv));
  return [
    {
      held: project === stamp.project,
      why: `the rigs print a project ${committed.riv} was not built from`,
    },
    { held: riv === stamp.riv, why: `${committed.riv} is not the file its build wrote` },
  ]
    .filter((check) => !check.held)
    .map((check) => check.why);
});

/** A production's ledger, as the repo keeps it (`core/production.ts`). */
const LedgerJson = repoJson(ProductionFile);

/** The owner's decisions on the ledger `ledger`, the file committed with the film. */
const decisionsAt = Effect.fn('decisionsAt')(function* (ledger: string) {
  const fs = yield* FileSystem.FileSystem;
  return decisionsOf(yield* Schema.decodeEffect(LedgerJson)(yield* fs.readFileString(ledger)));
});

/**
 * Which locked figures are not as the owner kept them, and which an
 * override frees: each figure's print (as its film draws it alone) hashed
 * and held to its lock (`heldTo`), each named by the item it is laid as in
 * its film, read against his decisions on his production's ledger, the file
 * `ledger`: a lock that names no decision there is broken, and an override
 * frees a print only on a decision of his on that figure filed after the
 * lock. A broken one answers why, and its print's sha256, the one an
 * override would name to free it. While no figure is locked it reads no
 * ledger.
 */
export const unlocked = Effect.fn('unlocked')(function* (
  ledger: string,
  locked: ReadonlyArray<{ readonly item: string; readonly lock: Lock; readonly print: string }>,
) {
  const decisions = locked.length === 0 ? [] : yield* decisionsAt(ledger);
  const answers = yield* Effect.forEach(locked, ({ item, lock, print }) =>
    Effect.map(sha256(new TextEncoder().encode(print)), (hash) => ({
      item,
      hash,
      held: heldTo(item, lock, hash, decisions),
    })),
  );
  return {
    broken: answers.flatMap(({ item, hash, held }) =>
      held._tag === 'Broken'
        ? [
            {
              item,
              hash,
              why: `${item}'s lock is broken (FigureLock, ${RULES.FigureLock.says}): ${held.why}`,
            },
          ]
        : [],
    ),
    overridden: answers.flatMap(({ item, held }) =>
      held._tag === 'Freed' ? [{ item, override: held.override }] : [],
    ),
  };
});

/**
 * Which overrides laid on a film's figures (`overridesIn`) the owner's
 * decisions do not allow (`unbacked`): each that no decision on his
 * production's ledger, the file `ledger`, filed at the point of the figure
 * it is laid on (and after the lock it frees, for a lock's), says in its
 * quote's words or answered with the pick it cites. The ledger is the one
 * committed with the film, as the override is: the word it cites is held to
 * those filed beside it. While no override is laid it reads none.
 */
export const unsaid = Effect.fn('unsaid')(function* (ledger: string, laid: ReadonlyArray<Laid>) {
  if (laid.length === 0) return [];
  return unbacked(laid, yield* decisionsAt(ledger));
});
