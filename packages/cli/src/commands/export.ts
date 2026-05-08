import { Command, Flag } from 'effect/unstable/cli';
import { Effect, FileSystem } from 'effect';

import { files, folder } from '~/src/lib/content/options';
import {
  parseFrontmatter,
  updateFrontmatter,
  type MessageFrontmatter,
} from '~/src/lib/frontmatter';
import {
  makeAppleNoteFromMarkdown,
  updateAppleNoteFromMarkdown,
} from '~/src/lib/markdown-to-notes';

const forceCreate = Flag.boolean('force-create').pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    'Create a new note even if the file already has an apple_note_id in frontmatter',
  ),
);

export const exportOutput = Command.make('export', { files, folder, forceCreate }, (args) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;

    if (args.files.length === 0) {
      yield* Effect.logError('No files specified. Use --files or -f to specify files to export.');
      return;
    }

    const targetFolder = args.folder._tag === 'Some' ? args.folder.value : undefined;

    yield* Effect.log(
      `Exporting ${args.files.length} file(s) to Apple Notes${targetFolder !== undefined ? ` (folder: ${targetFolder})` : ''}...`,
    );

    for (const filePath of args.files) {
      const rawContent = yield* fileSystem
        .readFile(filePath)
        .pipe(Effect.map((i) => new TextDecoder().decode(i)));

      const { frontmatter, content } = parseFrontmatter<MessageFrontmatter>(rawContent);
      const existingNoteId = frontmatter.apple_note_id;

      if (existingNoteId !== undefined && existingNoteId !== '' && !args.forceCreate) {
        yield* updateAppleNoteFromMarkdown(existingNoteId, content);
        yield* Effect.log(`  Updated: ${filePath} → ${existingNoteId}`);
        continue;
      }

      const { noteId } = yield* makeAppleNoteFromMarkdown(content, {
        folder: targetFolder,
      });

      const updatedContent = updateFrontmatter(rawContent, {
        apple_note_id: noteId,
      });
      yield* fileSystem.writeFile(filePath, new TextEncoder().encode(updatedContent));

      yield* Effect.log(`  Exported: ${filePath} → ${noteId}`);
    }

    yield* Effect.log(`Successfully exported ${args.files.length} file(s) to Apple Notes.`);
  }),
);
