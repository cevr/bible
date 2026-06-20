import { Command, Flag } from 'effect/unstable/cli';
import { Effect, FileSystem } from 'effect';

import { dryRun, files, folder } from '~/src/lib/content/options';
import {
  parseFrontmatter,
  updateFrontmatter,
  type MessageFrontmatter,
} from '~/src/lib/frontmatter';
import {
  makeAppleNoteFromMarkdown,
  updateAppleNoteFromMarkdown,
} from '~/src/lib/markdown-to-notes';
import { splitMarkdownIntoSections } from '~/src/lib/split-markdown';

const forceCreate = Flag.boolean('force-create').pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    'Create a new note even if the file already has an apple_note_id in frontmatter',
  ),
);

const split = Flag.boolean('split').pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    'Export each top-level section as its own note, using the document title as the folder. ' +
      'Per-section note ids are tracked in frontmatter so re-exports update in place.',
  ),
);

/** Frontmatter shape that tracks per-section note ids for --split re-exports. */
interface SplitFrontmatter extends MessageFrontmatter {
  /** slug -> apple note id, written back after a --split export. */
  apple_note_split?: Record<string, string>;
}

/**
 * Promote a block's leading "## Heading" to "# Heading" so Apple Notes uses it
 * as the note's sidebar title (Apple Notes titles from the H1).
 */
const promoteHeading = (markdown: string, title: string): string => {
  const withoutHeading = markdown.replace(/^##\s+.*(\r?\n)?/, '');
  return `# ${title}\n\n${withoutHeading.trim()}`.trim();
};

export const exportOutput = Command.make(
  'export',
  { files, folder, forceCreate, split, dryRun },
  (args) =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;

      if (args.files.length === 0) {
        yield* Effect.logError('No files specified. Use --files or -f to specify files to export.');
        return;
      }

      const targetFolder = args.folder._tag === 'Some' ? args.folder.value : undefined;

      yield* Effect.log(
        `${args.dryRun ? '[dry-run] Would export' : 'Exporting'} ${args.files.length} file(s) to Apple Notes${args.split ? ' (split per section)' : ''}${targetFolder !== undefined ? ` (folder: ${targetFolder})` : ''}...`,
      );

      for (const filePath of args.files) {
        const rawContent = yield* fileSystem
          .readFile(filePath)
          .pipe(Effect.map((i) => new TextDecoder().decode(i)));

        if (args.split) {
          yield* exportSplit(
            fileSystem,
            filePath,
            rawContent,
            targetFolder,
            args.forceCreate,
            args.dryRun,
          );
          continue;
        }

        const { frontmatter, content } = parseFrontmatter<MessageFrontmatter>(rawContent);
        const existingNoteId = frontmatter.apple_note_id;

        if (existingNoteId !== undefined && existingNoteId !== '' && !args.forceCreate) {
          if (args.dryRun) {
            yield* Effect.log(`  Would update: ${filePath} → ${existingNoteId}`);
            continue;
          }
          yield* updateAppleNoteFromMarkdown(existingNoteId, content);
          yield* Effect.log(`  Updated: ${filePath} → ${existingNoteId}`);
          continue;
        }

        if (args.dryRun) {
          const title =
            parseFrontmatter<MessageFrontmatter>(rawContent).frontmatter.topic ?? filePath;
          yield* Effect.log(
            `  Would create note "${title}"${targetFolder !== undefined ? ` in folder "${targetFolder}"` : ''}`,
          );
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

      yield* Effect.log(
        `${args.dryRun ? '[dry-run] No changes made. ' : 'Successfully exported '}${args.files.length} file(s)${args.dryRun ? ' previewed.' : ' to Apple Notes.'}`,
      );
    }),
);

/**
 * Export one file as many notes — one per top-level section — into a folder
 * named after the document title. Per-section note ids are tracked in the
 * file's `apple_note_split` frontmatter map so re-exports update in place.
 */
const exportSplit = Effect.fn('exportSplit')(function* (
  fileSystem: FileSystem.FileSystem,
  filePath: string,
  rawContent: string,
  folderOverride: string | undefined,
  forceCreate: boolean,
  dryRun: boolean,
) {
  const { frontmatter, content } = parseFrontmatter<SplitFrontmatter>(rawContent);
  const { folderTitle, blocks } = splitMarkdownIntoSections(content);

  // The document title is the folder, unless --folder overrides it.
  const noteFolder = folderOverride ?? folderTitle;
  // Existing slug -> note id map (for update-in-place on re-export).
  const existingIds: Record<string, string> =
    !forceCreate && typeof frontmatter.apple_note_split === 'object'
      ? { ...frontmatter.apple_note_split }
      : {};

  yield* Effect.log(
    `  ${dryRun ? '[dry-run] Would split' : 'Splitting'} "${filePath}" → ${blocks.length} note(s) in folder "${noteFolder}"...`,
  );

  const noteIds: Record<string, string> = {};

  for (const block of blocks) {
    const existingId = existingIds[block.slug];
    const willUpdate = existingId !== undefined && existingId !== '';

    if (dryRun) {
      yield* Effect.log(
        `    Would ${willUpdate ? `update: ${block.title} → ${existingId}` : `create: ${block.title}`}`,
      );
      continue;
    }

    const noteMarkdown = promoteHeading(block.markdown, block.title);

    if (willUpdate) {
      yield* updateAppleNoteFromMarkdown(existingId, noteMarkdown, {
        title: block.title,
      });
      noteIds[block.slug] = existingId;
      yield* Effect.log(`    Updated: ${block.title} → ${existingId}`);
      continue;
    }

    const { noteId } = yield* makeAppleNoteFromMarkdown(noteMarkdown, {
      folder: noteFolder,
      title: block.title,
    });
    noteIds[block.slug] = noteId;
    yield* Effect.log(`    Created: ${block.title} → ${noteId}`);
  }

  if (dryRun) return;

  const updatedContent = updateFrontmatter(rawContent, {
    apple_note_split: noteIds,
  });
  yield* fileSystem.writeFile(filePath, new TextEncoder().encode(updatedContent));
});
