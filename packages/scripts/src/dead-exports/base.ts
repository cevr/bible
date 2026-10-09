// The approved base the debt is held against: the debt file as the base
// revision has it. A line the base lacks is debt grown by this change, and
// the check refuses it, so adding a dead export together with its debt line
// does not pass.
//
// Which revision is the base:
//   - one named outright (`DEAD_EXPORTS_BASE`): CI names the push's pre-push
//     SHA, or the pull request's base SHA, so a push of several commits is held
//     as a whole. A name git cannot read fails; an all-zero one (a new branch)
//     names nothing and the local rule stands.
//   - otherwise the merge-base with the newer of `main` and `origin/main` (one
//     the other's descendant; if they have diverged, `origin/main`); on `main`
//     itself that is the head, so the head's first parent stands in.
// Where git or a base cannot be had, the check fails: it never passes unread.
// A base that lacks the check itself (the first adoption) has no debt to hold
// the change to; a base that has the check but no debt file fails.

import { Array as Arr, Data, Effect, Option, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

/** No base revision to hold the debt against (no git, no `main`, a shallow clone with no parent). */
class BaseUnavailable extends Data.TaggedError('BaseUnavailable')<{
  readonly reason: string;
}> {}

/** The check's two files, relative to the repository root. */
interface Files {
  /** The check itself: a base without it is before the check's adoption. */
  readonly check: string;
  /** The debt file. */
  readonly debt: string;
}

/** The lines of `debt` that `base` lacks: debt this change added. */
const grownDebt = (
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

/** Whether `git <args>` exits 0 in `root`. */
const holds = (root: string, args: ReadonlyArray<string>) =>
  Effect.map(git(root, args), Option.isSome);

/** The commit `ref` names, if it names one. */
const commitOf = (root: string, ref: string) =>
  git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);

/** The ref to take the merge-base with: the newer of the local `main` and `origin/main`. */
const newerMain = (root: string) =>
  Effect.gen(function* () {
    const local = yield* commitOf(root, 'main');
    const remote = yield* commitOf(root, 'origin/main');
    if (Option.isNone(remote)) return Option.map(local, () => 'main');
    if (Option.isNone(local)) return Option.some('origin/main');
    // The descendant is the newer; refs that have diverged take the remote.
    if (yield* holds(root, ['merge-base', '--is-ancestor', 'origin/main', 'main']))
      return Option.some('main');
    return Option.some('origin/main');
  });

/** The base the local rule gives: where the branch left main, or main's own previous commit. */
const localBase = (root: string) =>
  Effect.gen(function* () {
    const head = yield* git(root, ['rev-parse', 'HEAD']);
    if (Option.isNone(head))
      return yield* new BaseUnavailable({ reason: 'git reads no HEAD here' });
    const main = yield* newerMain(root);
    if (Option.isNone(main))
      return yield* new BaseUnavailable({
        reason: 'there is no main or origin/main to compare with',
      });
    const mergeBase = yield* git(root, ['merge-base', 'HEAD', main.value]);
    if (Option.isNone(mergeBase) || mergeBase.value === '')
      return yield* new BaseUnavailable({ reason: `no merge-base of HEAD with ${main.value}` });
    if (mergeBase.value !== head.value) return mergeBase.value;
    // On `main` itself the merge-base is the head: the change is the head's own.
    const parent = yield* git(root, ['rev-parse', '--verify', '--quiet', 'HEAD^']);
    if (Option.isSome(parent) && parent.value !== '') return parent.value;
    return yield* new BaseUnavailable({
      reason: 'HEAD is on main with no parent to hold the debt against (a shallow clone?)',
    });
  });

/** The revision the debt is held against: the one `explicit` names, or the local rule's. */
const baseRevision = (root: string, explicit: Option.Option<string>) =>
  Effect.gen(function* () {
    const named = Option.filter(explicit, (sha) => sha !== '' && !/^0+$/.test(sha));
    if (Option.isNone(named)) return yield* localBase(root);
    const commit = yield* commitOf(root, named.value);
    if (Option.isNone(commit))
      return yield* new BaseUnavailable({
        reason: `git reads no commit ${named.value} (the base named outright)`,
      });
    return commit.value;
  });

/**
 * The debt file at `revision`: its lines, or none when that revision predates
 * the check (it has no `files.check`): the first adoption has no debt to hold
 * the change to. A revision with the check and no debt file is unavailable.
 */
const debtAt = (root: string, revision: string, files: Files) =>
  Effect.gen(function* () {
    if (!(yield* holds(root, ['cat-file', '-e', `${revision}:${files.check}`])))
      return Option.none<ReadonlyArray<string>>();
    const text = yield* git(root, ['show', `${revision}:${files.debt}`]);
    if (Option.isNone(text))
      return yield* new BaseUnavailable({
        reason: `${revision} has the check but no ${files.debt}`,
      });
    return Option.some(debtLines(text.value));
  });

/** The lines of `debt` this change grew over its base: none when the check is being adopted. */
export const grownOver = (
  root: string,
  files: Files,
  explicit: Option.Option<string>,
  debt: ReadonlyArray<string>,
) =>
  baseRevision(root, explicit).pipe(
    Effect.flatMap((revision) => debtAt(root, revision, files)),
    Effect.map(Option.match({ onNone: () => [], onSome: (lines) => grownDebt(debt, lines) })),
  );
