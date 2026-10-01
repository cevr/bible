// `--accept-mismatch`: which beats may keep a take whose transcript does not
// match its line. It names them (`--accept-mismatch a,b`), so accepting one
// beat's known mismatch never waves through another's; bare, it means the
// `--only` beats, and without `--only` it names nothing and fails.
//
// Pure: the CLI resolves the flag before a take is recorded or imported, and
// prints a TakeMismatch with the flags that re-record or keep it.

import { Array as Arr, Option, Result, Schema } from 'effect';
import { AcceptMismatchUnnamed, TakeMismatch, UnknownScene } from './errors.ts';

/** The flag's name on the command line. */
const ACCEPT_MISMATCH = '--accept-mismatch';

/**
 * The beats `--accept-mismatch` accepts: none without it, the ones it names,
 * or bare (an empty value) the `--only` beats. A named beat the film does not
 * have (`known`) fails UnknownScene; bare without `--only`,
 * AcceptMismatchUnnamed.
 */
export const acceptedBeats = (
  flag: Option.Option<string>,
  only: Option.Option<ReadonlySet<string>>,
  known: ReadonlyArray<string>,
): Result.Result<ReadonlySet<string>, AcceptMismatchUnnamed | UnknownScene> => {
  if (Option.isNone(flag)) return Result.succeed(new Set());
  const named = flag.value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (named.length === 0) return Result.fromOption(only, () => AcceptMismatchUnnamed.make({}));
  const unknown = Arr.findFirst(named, (id) => !known.includes(id));
  if (Option.isSome(unknown))
    return Result.fail(UnknownScene.make({ scene: unknown.value, known }));
  return Result.succeed(new Set(named));
};

/**
 * The command line with a bare `--accept-mismatch` (last, or before another
 * flag) given an empty value (`--accept-mismatch=`), so the parser reads it
 * as bare instead of wanting the next word. Everything else as it was.
 */
export const bareAcceptMismatch = (args: ReadonlyArray<string>): ReadonlyArray<string> =>
  args.map((arg, i) => {
    const next = Arr.get(args, i + 1);
    const bare =
      arg === ACCEPT_MISMATCH &&
      Option.match(next, {
        onNone: () => true,
        onSome: (n) => n.startsWith('-'),
      });
    if (bare) return `${ACCEPT_MISMATCH}=`;
    return arg;
  });

/** A TakeMismatch as the command line prints it (the same tag and fields): with the flags that re-record or keep it. */
class TakeMismatchToRerun extends Schema.TaggedError<TakeMismatchToRerun>()(
  'TakeMismatch',
  TakeMismatch.fields,
) {
  override get message() {
    const said = TakeMismatch.make({
      id: this.id,
      script: this.script,
      heard: this.heard,
      wer: this.wer,
    });
    return `${said.message}\nre-record it with --only ${this.id}, or keep it with ${ACCEPT_MISMATCH}`;
  }
}

/** A run's failure as the command line prints it: a TakeMismatch with its flags, any other as it is. */
export const atTheCommandLine = <E>(error: E): E | TakeMismatchToRerun => {
  if (Schema.is(TakeMismatch)(error))
    return TakeMismatchToRerun.make({
      id: error.id,
      script: error.script,
      heard: error.heard,
      wer: error.wer,
    });
  return error;
};
