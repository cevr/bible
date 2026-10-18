/**
 * The `audio-copy` command's arguments, without its handler: `copy.ts` gives
 * it the jobs, and the tests give it a handler that only records the mode.
 *
 * `--dry-run` is optional: absent, the command selects the real run.
 */
import { Command, Flag } from 'effect/cli';

export const audioCopyCommand = Command.make('audio-copy', {
  dryRun: Flag.Boolean('dry-run').pipe(
    Flag.withDefault(false),
    Flag.withDescription('Read the sources and print what would move; never touch R2'),
  ),
}).pipe(Command.withDescription('Copy the hymn recordings from S3 into the R2 bucket cvr-hymns'));
