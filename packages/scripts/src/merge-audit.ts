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

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Option, Runtime, Schema } from 'effect';
import { Argument, Command } from 'effect/cli';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { conflictedPaths, fileLines, headLine, lostEdits } from './merge-audit/audit.js';

class NotAMerge extends Schema.TaggedError<NotAMerge>()('NotAMerge', {
  commit: Schema.String,
}) {
  override get message() {
    return `${this.commit} is not a merge commit: it has no second parent`;
  }
  override readonly [Runtime.errorReported] = false;
}

/** A git command's stdout, whatever its exit code (merge-tree exits 1 on a conflict). */
const git = (args: ReadonlyArray<string>) =>
  Effect.flatMap(ChildProcessSpawner, (spawner) => spawner.string(ChildProcess.make('git', args)));

/** A commit's full sha, or none when `ref` names no commit. */
const shaOf = (ref: string) =>
  git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).pipe(
    Effect.map((out) => Option.liftPredicate(out.trim(), (sha) => sha !== '')),
    Effect.catch(() => Effect.succeed(Option.none<string>())),
  );

/** A file's text at a commit or tree; empty where it does not exist. */
const textAt = (tree: string, file: string) =>
  git(['show', `${tree}:${file}`]).pipe(Effect.catch(() => Effect.succeed('')));

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

const command = Command.make(
  'merge-audit',
  { merge: Argument.String('merge').pipe(Argument.optional) },
  ({ merge }) =>
    audit(Option.getOrElse(merge, () => 'HEAD')).pipe(
      Effect.tapErrorTag('NotAMerge', (error) => Console.error(error.message)),
    ),
).pipe(
  Command.withDescription(
    "Print, for each file a merge resolved by hand, the lines of either parent's edits it lost",
  ),
);

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
