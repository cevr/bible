#!/usr/bin/env bun
// How a merge resolved its conflicts: redoes git's own merge of the two
// parents (`git merge-tree --write-tree`), and for each file the merge commit
// differs from it in, prints the lines one parent added that the resolution
// dropped and the lines one parent removed that it brought back. A conflict
// resolved by taking one side's file whole shows up here as the other side's
// edits, line by line.
//
//   bun run merge-audit           # the checkout's HEAD, a merge
//   bun run merge-audit <merge>   # another merge commit
//
// Prints `merge-audit <sha> conflicted=<n> resolved-by-hand=<n>`, then per
// file either `… keeps both parents' edits` or one `dropped ^1|^2: "<line>"` /
// `restored ^1|^2: "<line>"` line per edit lost (^1 is the branch merged into,
// ^2 the one merged). Then each merge the merged branch made itself (a batch's
// merge of main, where its conflicts were resolved), oldest first, the same
// way under `merge-audit <sha> inside <merge> conflicted=<n> …`. The loop
// pastes the output onto the batch's ledger row, each lost line with why.
// Exits non-zero only when the commit is not a merge or git fails; a commit
// that is not a merge prints its refusal alone.
//
//   bun run merge-audit --review <file> [--review <file>…]
//
// The unit's reviews against the lessons ledger (`lessons/ledger.ts`): prints
// `merge-audit review <unit>/<file> F<n> routed <entry>` for each finding an
// entry of `docs/lessons.md` cites, `… declined` for one its review classes
// `none` and no entry cites (a finding with no guard needs no entry), `…
// unrouted` for any other one no entry cites, `… no guard class` or `… no
// cheapest guard` for one that leaves its line out, and `merge-audit ledger
// <problem>` for an entry whose guard its file does not hold. It exits
// non-zero on any of them but `declined`.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Option, Runtime, Schema, Stream } from 'effect';
import * as Bool from 'effect/Boolean';
import { Argument, Command, Flag } from 'effect/cli';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { ledgerProblems, reviewRoutes } from './lessons/ledger.js';
import { conflictedPaths, fileLines, headLine, lostEdits } from './merge-audit/audit.js';

class NotAMerge extends Schema.TaggedError<NotAMerge>()('NotAMerge', {
  commit: Schema.String,
}) {
  override get message() {
    return `${this.commit} is not a merge commit: it has no second parent`;
  }
  override readonly [Runtime.errorReported] = false;
}

/**
 * A git command's stdout, whatever its exit code: `merge-tree` exits 1 on a
 * conflict, and its tree is still the answer. `--review` reads the root
 * through `gitChecked`, which fails on a non-zero exit.
 */
const git = (args: ReadonlyArray<string>) =>
  Effect.flatMap(ChildProcessSpawner, (spawner) =>
    spawner.string(ChildProcess.make('git', args, { forceKillAfter: '5 seconds' })),
  );

/** A commit's full sha, or none when `ref` names no commit. */
const shaOf = (ref: string) =>
  git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).pipe(
    Effect.map((out) => Option.liftPredicate(out.trim(), (sha) => sha !== '')),
    Effect.orElseSucceed(() => Option.none<string>()),
  );

/** A file's text at a commit or tree; empty where it does not exist. */
const textAt = (tree: string, file: string) =>
  git(['show', `${tree}:${file}`]).pipe(Effect.orElseSucceed(() => ''));

const lines = (out: string) => out.split('\n').filter((line) => line !== '');

/** Print one merge's audit: its head line, then each file its resolution changed. */
const auditOne = (merge: string, second: string, inside: Option.Option<string>) =>
  Effect.gen(function* () {
    const first = `${merge}^1`;
    const base = (yield* git(['merge-base', first, second])).trim();
    const redone = yield* git(['merge-tree', '--write-tree', first, second]);
    const tree = redone.split('\n')[0] ?? '';
    const changed = lines(yield* git(['diff', '--name-only', tree, merge]));
    yield* Console.log(headLine(merge, conflictedPaths(redone), changed, inside));
    yield* Effect.forEach(changed, (file) =>
      Effect.gen(function* () {
        const [b, one, two, merged] = yield* Effect.all(
          [textAt(base, file), textAt(first, file), textAt(second, file), textAt(merge, file)],
          { concurrency: 4 },
        );
        const lost = fileLines(file, lostEdits({ base: b, first: one, second: two, merged }));
        yield* Effect.forEach(lost, (line) => Console.log(line));
      }),
    );
  });

/** A merge's second parent, or NotAMerge naming `ref`. */
const secondOf = (merge: string, ref: string) =>
  Effect.flatMap(shaOf(`${merge}^2`), (sha) =>
    Effect.fromOption(sha).pipe(Effect.mapError(() => NotAMerge.make({ commit: ref }))),
  );

const audit = Effect.fn('mergeAudit')(function* (ref: string) {
  const merge = yield* Effect.flatMap(shaOf(ref), (sha) =>
    Effect.fromOption(sha).pipe(Effect.mapError(() => NotAMerge.make({ commit: ref }))),
  );
  const second = yield* secondOf(merge, ref);
  yield* auditOne(merge, second, Option.none());
  // The merged branch's own merges (of main, mostly), oldest first: a conflict
  // resolved there reaches this merge already resolved.
  const inner = lines(yield* git(['rev-list', '--merges', '--reverse', `${merge}^1..${second}`]));
  yield* Effect.forEach(inner, (sha) =>
    Effect.flatMap(secondOf(sha, sha), (two) => auditOne(sha, two, Option.some(merge))),
  );
});

/** A git step `--review` reads (the root): it exited non-zero. */
class GitFailed extends Schema.TaggedError<GitFailed>()('GitFailed', {
  command: Schema.String,
  output: Schema.String,
}) {
  override get message() {
    return `merge-audit \`${this.command}\` failed: ${this.output.trim()}`;
  }
  override readonly [Runtime.errorReported] = false;
}

/** A git command's stdout, or GitFailed with what it printed when it exits non-zero. */
const gitChecked = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make('git', args, { forceKillAfter: '5 seconds' }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [
        Stream.mkString(Stream.decodeText(child.stdout)),
        Stream.mkString(Stream.decodeText(child.stderr)),
        child.exitCode,
      ],
      { concurrency: 3 },
    );
    if (code === 0) return stdout;
    return yield* GitFailed.make({
      command: ['git', ...args].join(' '),
      output: `${stdout}${stderr}`,
    });
  }).pipe(Effect.scoped);

/** A review whose findings are not all routed to the ledger, or a ledger whose guards do not hold. */
class Unrouted extends Schema.TaggedError<Unrouted>()('Unrouted', {
  problems: Schema.Finite,
}) {
  override get message() {
    return `merge-audit review: ${this.problems} problem(s); route each finding to an entry of docs/lessons.md, its Source citing <unit>/<file> F<n>`;
  }
  override readonly [Runtime.errorReported] = false;
}

/**
 * `--review <file>…`: each finding of the reviews routed to the ledger entry
 * that cites it, each finding's guard lines read, and the ledger held to its
 * guards, at the checkout's root.
 */
const review = Effect.fn('mergeAudit.review')(function* (files: ReadonlyArray<string>) {
  const root = (yield* gitChecked(['rev-parse', '--show-toplevel'])).trim();
  const routes = yield* reviewRoutes(root, files);
  const ledger = yield* ledgerProblems(root);
  const lines = [
    ...routes.flatMap((route) => [
      `merge-audit review ${route.ref} ${Option.match(route.by, { onNone: () => Bool.match(route.declined, { onFalse: () => 'unrouted', onTrue: () => 'declined' }), onSome: (entry) => `routed ${entry}` })}`,
      ...[`merge-audit review ${route.ref} no guard class`].filter(() => !route.classed),
      ...[`merge-audit review ${route.ref} no cheapest guard`].filter(() => !route.guarded),
    ]),
    ...ledger.problems.map((problem) => `merge-audit ledger ${problem}`),
  ];
  yield* Effect.forEach(lines, (line) => Console.log(line), { discard: true });
  const problems =
    routes.filter(
      (route) => (Option.isNone(route.by) && !route.declined) || !route.classed || !route.guarded,
    ).length + ledger.problems.length;
  yield* Console.log(
    `merge-audit review ${routes.length} finding(s), ${ledger.entries} ledger entries: ${problems} problem(s)`,
  );
  if (problems > 0) return yield* Unrouted.make({ problems });
});

const command = Command.make(
  'merge-audit',
  {
    merge: Argument.String('merge').pipe(Argument.optional),
    reviews: Flag.String('review').pipe(
      Flag.atLeast(0),
      Flag.withDescription(
        "route each finding of a unit's review to its lessons ledger entry instead (repeatable)",
      ),
    ),
  },
  ({ merge, reviews }) =>
    Effect.gen(function* () {
      if (reviews.length > 0)
        return yield* review(reviews).pipe(
          Effect.tapErrorTag('Unrouted', (error) => Console.error(error.message)),
          Effect.tapErrorTag('GitFailed', (error) => Console.error(error.message)),
        );
      return yield* audit(Option.getOrElse(merge, () => 'HEAD')).pipe(
        Effect.tapErrorTag('NotAMerge', (error) => Console.error(error.message)),
      );
    }),
).pipe(
  Command.withDescription(
    "Print, for each file a merge resolved by hand, the lines of either parent's edits it lost",
  ),
);

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
