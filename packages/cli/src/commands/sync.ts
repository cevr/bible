/**
 * Sync CLI Commands
 *
 * `bible sync` - Sync Bible database from JSON assets
 * `bible sync --force` - Recreate database even if it exists
 */

import { defaultBibleSyncPaths, syncBible } from '@bible/core/sync';
import { Flag, Command } from 'effect/unstable/cli';
import { Effect, Schema } from 'effect';

class SyncError extends Schema.TaggedError<SyncError>()('SyncError', {
  cause: Schema.Unknown,
}) {}

const force = Flag.Boolean('force').pipe(Flag.withDefault(false));

export const sync = Command.make('sync', { force }, (args) =>
  Effect.gen(function* () {
    const paths = yield* defaultBibleSyncPaths();
    yield* syncBible(args.force, paths);
  }).pipe(Effect.mapError((cause) => SyncError.make({ cause }))),
);
