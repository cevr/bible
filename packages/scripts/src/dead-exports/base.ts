// The approved base the debt is held against: the debt file as the base
// revision has it. A line the base lacks is debt grown by this change, and
// the check refuses it, so adding a dead export together with its debt line
// does not pass. The base is the merge-base with `main` (or `origin/main`);
// on `main` itself that is the head, so the head's first parent stands in.
// Where git or a base cannot be had, the check fails: it never passes unread.

import { Array as Arr, Data, Effect, Option, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** No base revision to hold the debt against (no git, no `main`, a shallow clone with no parent). */
class BaseUnavailable extends Data.TaggedError('BaseUnavailable')<{
  readonly reason: string;
}> {}

/** The lines of `debt` that `base` lacks: debt this change added. */
export const grownDebt = (
  debt: ReadonlyArray<string>,
  base: ReadonlyArray<string>,
): ReadonlyArray<string> => Arr.difference(debt, base);

/** The debt file's lines of a text. */
export const debtLines = (text: string): ReadonlyArray<string> =>
  text.split('\n').filter((line) => line !== '');

/** What `git <args>` prints in `root` when it exits 0, or none when it fails or git is absent. */
const git = (root: string, args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* spawner.spawn(ChildProcess.make('git', args, { cwd: root }));
        const [out, code] = yield* Effect.all(
          [Stream.decodeText(handle.stdout).pipe(Stream.mkString), handle.exitCode],
          { concurrency: 'unbounded' },
        );
        return Option.filter(Option.some(out.trim()), () => code === 0);
      }),
    ).pipe(Effect.orElseSucceed(() => Option.none<string>()));
  });

/** The revision the debt is held against, or why there is none. */
export const baseRevision = (root: string) =>
  Effect.gen(function* () {
    const head = yield* git(root, ['rev-parse', 'HEAD']);
    if (Option.isNone(head))
      return yield* new BaseUnavailable({ reason: 'git reads no HEAD here' });
    for (const ref of ['main', 'origin/main']) {
      const mergeBase = yield* git(root, ['merge-base', 'HEAD', ref]);
      if (Option.isNone(mergeBase) || mergeBase.value === '') continue;
      if (mergeBase.value !== head.value) return mergeBase.value;
      // On `main` itself the merge-base is the head: the change is the head's own.
      const parent = yield* git(root, ['rev-parse', 'HEAD^']);
      if (Option.isSome(parent) && parent.value !== '') return parent.value;
    }
    return yield* new BaseUnavailable({
      reason:
        'no merge-base with main or origin/main, and no parent of HEAD on main (a shallow clone?)',
    });
  });

/** The debt file at `revision`: its lines, or none when that revision has no such file (the debt is introduced). */
export const debtAt = (root: string, revision: string, file: string) =>
  Effect.gen(function* () {
    const exists = yield* git(root, ['cat-file', '-e', `${revision}:${file}`]);
    if (Option.isNone(exists)) return Option.none<ReadonlyArray<string>>();
    const text = yield* git(root, ['show', `${revision}:${file}`]);
    if (Option.isNone(text))
      return yield* new BaseUnavailable({ reason: `git cannot show ${file} at ${revision}` });
    return Option.some(debtLines(text.value));
  });
