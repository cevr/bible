import { Flag } from 'effect/unstable/cli';

export const file = Flag.File('file').pipe(
  Flag.withAlias('f'),
  Flag.withDescription('Path to file'),
);

export const files = Flag.File('files').pipe(
  Flag.withAlias('f'),
  Flag.atLeast(0),
  Flag.withDescription('Files to process'),
);

export const json = Flag.Boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Output as JSON'),
);

export const noteId = Flag.String('note-id').pipe(
  Flag.withAlias('n'),
  Flag.withDescription('Apple Note ID'),
);

export const dryRun = Flag.Boolean('dry-run').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Preview without making changes'),
);

export const folder = Flag.String('folder').pipe(
  Flag.withDescription('Target folder in Apple Notes'),
  Flag.optional,
);
