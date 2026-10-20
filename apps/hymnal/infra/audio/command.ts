/**
 * The `audio-copy` and `audio-upload` commands' arguments, without their
 * handlers: `copy.ts` and `upload.ts` give them their jobs, and the tests give
 * each a handler that only records what it was given.
 *
 * `--dry-run` is optional on both: absent, the command selects the real run.
 */
import { Command, Flag } from 'effect/cli';

export const audioCopyCommand = Command.make('audio-copy', {
  dryRun: Flag.Boolean('dry-run').pipe(
    Flag.withDefault(false),
    Flag.withDescription('Read the sources and print what would move; never touch R2'),
  ),
}).pipe(Command.withDescription('Copy the hymn recordings from S3 into the R2 bucket cvr-hymns'));

/** The `audio-upload` command's arguments: the set's folder, and `--dry-run` (absent: the real run). */
export const audioUploadCommand = Command.make('audio-upload', {
  set: Flag.String('set').pipe(
    Flag.withDescription('The rendered set folder, holding manifest.json and <n>.mp3'),
  ),
  dryRun: Flag.Boolean('dry-run').pipe(
    Flag.withDefault(false),
    Flag.withDescription('Read and check the set and print what would move; never touch R2'),
  ),
}).pipe(
  Command.withDescription('Upload a rendered set of hymn recordings into the R2 bucket cvr-hymns'),
);
