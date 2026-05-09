import { Flag } from 'effect/unstable/cli';

export const file = Flag.file('file').pipe(
  Flag.withAlias('f'),
  Flag.withDescription('Path to file'),
);

export const files = Flag.file('files').pipe(
  Flag.withAlias('f'),
  Flag.atLeast(0),
  Flag.withDescription('Files to process'),
);

export const json = Flag.boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Output as JSON'),
);

export const noteId = Flag.string('note-id').pipe(
  Flag.withAlias('n'),
  Flag.withDescription('Apple Note ID'),
);

export const dryRun = Flag.boolean('dry-run').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Preview without making changes'),
);

export const folder = Flag.string('folder').pipe(
  Flag.withDescription('Target folder in Apple Notes'),
  Flag.optional,
);
