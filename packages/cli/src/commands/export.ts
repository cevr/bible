// @effect-diagnostics strictEffectProvide:off
import { Command } from 'effect/unstable/cli';
import { Effect, FileSystem } from 'effect';

import { files, folder } from '~/src/lib/content/options';
import {
  parseFrontmatter,
  updateFrontmatter,
  type MessageFrontmatter,
} from '~/src/lib/frontmatter';
import { makeAppleNoteFromMarkdown } from '~/src/lib/markdown-to-notes';

export const exportOutput = Command.make('export', { files, folder }, (args) =>
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

      // Parse to get content without frontmatter for export
      const { content } = parseFrontmatter<MessageFrontmatter>(rawContent);

      // Export and get the note ID
      const { noteId } = yield* makeAppleNoteFromMarkdown(content, {
        folder: targetFolder,
      });

      // Update the file with the note ID in frontmatter
      const updatedContent = updateFrontmatter(rawContent, {
        apple_note_id: noteId,
      });
      yield* fileSystem.writeFile(filePath, new TextEncoder().encode(updatedContent));

      yield* Effect.log(`  Exported: ${filePath} → ${noteId}`);
    }

    yield* Effect.log(`Successfully exported ${args.files.length} file(s) to Apple Notes.`);
  }),
);
