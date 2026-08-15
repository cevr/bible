import { Command, Flag } from 'effect/unstable/cli';
import { Effect, FileSystem, Option, Schema } from 'effect';

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

      const targetFolder = args.folder;

      let exportVerb = 'Exporting';
      if (args.dryRun) exportVerb = '[dry-run] Would export';
      let splitSummary = '';
      if (args.split) splitSummary = ' (split per section)';
      let folderSummary = '';
      if (Option.isSome(targetFolder)) folderSummary = ` (folder: ${targetFolder.value})`;
      yield* Effect.log(
        `${exportVerb} ${args.files.length} file(s) to Apple Notes${splitSummary}${folderSummary}...`,
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
        const existingNoteId = Option.filter(
          Option.fromNullishOr(frontmatter.apple_note_id),
          (id) => id !== '',
        );

        if (Option.isSome(existingNoteId) && !args.forceCreate) {
          if (args.dryRun) {
            yield* Effect.log(`  Would update: ${filePath} → ${existingNoteId.value}`);
            continue;
          }
          yield* updateAppleNoteFromMarkdown(existingNoteId.value, content);
          yield* Effect.log(`  Updated: ${filePath} → ${existingNoteId.value}`);
          continue;
        }

        if (args.dryRun) {
          const title =
            parseFrontmatter<MessageFrontmatter>(rawContent).frontmatter.topic ?? filePath;
          let targetFolderDescription = '';
          if (Option.isSome(targetFolder)) {
            targetFolderDescription = ` in folder "${targetFolder.value}"`;
          }
          yield* Effect.log(`  Would create note "${title}"${targetFolderDescription}`);
          continue;
        }

        const { noteId } = yield* makeAppleNoteFromMarkdown(content, {
          folder: Option.getOrUndefined(targetFolder),
        });

        const updatedContent = updateFrontmatter(rawContent, {
          apple_note_id: noteId,
        });
        yield* fileSystem.writeFile(filePath, new TextEncoder().encode(updatedContent));

        yield* Effect.log(`  Exported: ${filePath} → ${noteId}`);
      }

      let completionPrefix = 'Successfully exported ';
      let completionSuffix = ' to Apple Notes.';
      if (args.dryRun) {
        completionPrefix = '[dry-run] No changes made. ';
        completionSuffix = ' previewed.';
      }
      yield* Effect.log(`${completionPrefix}${args.files.length} file(s)${completionSuffix}`);
    }),
);

/**
 * Export one file as many notes — one per top-level section — into a folder
 * named after the document title. Per-section note ids are tracked in the
 * file's `apple_note_split` frontmatter map so re-exports update in place.
 */
const SplitIdMap = Schema.Record(Schema.String, Schema.String);
const decodeSplitIdMap = Schema.decodeUnknownOption(SplitIdMap);

const exportSplit = Effect.fn('exportSplit')(function* (
  fileSystem: FileSystem.FileSystem,
  filePath: string,
  rawContent: string,
  folderOverride: Option.Option<string>,
  forceCreate: boolean,
  dryRun: boolean,
) {
  const { frontmatter, content } = parseFrontmatter<SplitFrontmatter>(rawContent);
  const { folderTitle, blocks } = splitMarkdownIntoSections(content);

  // The document title is the folder, unless --folder overrides it.
  const noteFolder = Option.getOrElse(folderOverride, () => folderTitle);
  // Existing slug -> note id map (for update-in-place on re-export).
  let existingIds: Readonly<Record<string, string>> = {};
  const decodedIds = decodeSplitIdMap(frontmatter.apple_note_split);
  if (!forceCreate && Option.isSome(decodedIds)) {
    existingIds = decodedIds.value;
  }

  let splitVerb = 'Splitting';
  if (dryRun) splitVerb = '[dry-run] Would split';
  yield* Effect.log(
    `  ${splitVerb} "${filePath}" → ${blocks.length} note(s) in folder "${noteFolder}"...`,
  );

  const noteIds: Record<string, string> = {};

  for (const block of blocks) {
    const existingId = Option.filter(
      Option.fromNullishOr(existingIds[block.slug]),
      (id) => id !== '',
    );

    if (dryRun) {
      let operation = `create: ${block.title}`;
      if (Option.isSome(existingId)) operation = `update: ${block.title} → ${existingId.value}`;
      yield* Effect.log(`    Would ${operation}`);
      continue;
    }

    const noteMarkdown = promoteHeading(block.markdown, block.title);

    if (Option.isSome(existingId)) {
      yield* updateAppleNoteFromMarkdown(existingId.value, noteMarkdown, {
        title: block.title,
      });
      noteIds[block.slug] = existingId.value;
      yield* Effect.log(`    Updated: ${block.title} → ${existingId.value}`);
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
