/**
 * Sync CLI Commands
 *
 * `bible sync` - Sync Bible database from JSON assets
 * `bible sync --force` - Recreate database even if it exists
 */

import { syncBible } from '@bible/core/sync';
import { Flag, Command } from 'effect/unstable/cli';
import { Effect, Schema } from 'effect';

class SyncError extends Schema.TaggedErrorClass<SyncError>()('SyncError', {
  cause: Schema.Defect,
}) {}

const force = Flag.boolean('force').pipe(Flag.withDefault(false));

export const sync = Command.make('sync', { force }, (args) =>
  Effect.tryPromise({
    try: () => syncBible(args.force),
    catch: (error) => new SyncError({ cause: error }),
  }),
);
