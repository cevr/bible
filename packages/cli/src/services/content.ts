import type { Cause, Schema } from 'effect';
import { Effect, FileSystem, Layer, Match, Context } from 'effect';
import type * as PlatformError from 'effect/PlatformError';
import { join } from 'path';

import type { ContentTypeConfig, SortStrategy } from '~/src/lib/content/types';
import {
  parseFrontmatter,
  removeFrontmatterFields,
  updateFrontmatter,
} from '~/src/lib/frontmatter';
import { getOutputsPath } from '~/src/lib/paths';
import {
  makeAppleNoteFromMarkdown,
  updateAppleNoteFromMarkdown,
  type MarkdownParseError,
} from '~/src/lib/markdown-to-notes';
import { deleteNote, type NoteOperationError } from '~/src/lib/notes-utils';
import type { AppleScript } from '~/src/services/apple-script';

type ContentListError = Schema.SchemaError;
type ContentExportError =
  | Schema.SchemaError
  | PlatformError.PlatformError
  | MarkdownParseError
  | Cause.UnknownError;
type ContentSyncError = PlatformError.PlatformError | MarkdownParseError | Cause.UnknownError;
type ContentDeleteError = PlatformError.PlatformError | NoteOperationError | Cause.UnknownError;

// Service interface with proper error/context types
export class ContentService extends Context.Service<
  ContentService,
  {
    readonly list: (json: boolean) => Effect.Effect<void, ContentListError>;
    readonly export: (
      filePaths: readonly string[],
      folder?: string,
    ) => Effect.Effect<void, ContentExportError, AppleScript>;
    readonly sync: (
      filePaths: readonly string[],
    ) => Effect.Effect<void, ContentSyncError, AppleScript>;
    readonly deleteNotes: (filePaths: readonly string[]) => Effect.Effect<void, ContentDeleteError>;
  }
>()('@bible/cli/services/content/ContentService') {
  static make = <F extends Schema.Top>(config: ContentTypeConfig<F>) =>
    Layer.effect(
      ContentService,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;

        const list = (json: boolean) =>
          Effect.gen(function* () {
            const outputDir = getOutputsPath(config.outputDir);
            const files = yield* fs
              .readDirectory(outputDir)
              .pipe(Effect.catch(() => Effect.succeed([] as string[])));

            const mdFiles = files.filter((f) => f.endsWith('.md'));
            const sorted = sortFiles(mdFiles, config.sortStrategy);
            const filePaths = sorted.map((f) => join(outputDir, f));

            if (json) {
              const jsonOutput = JSON.stringify(filePaths, null, 2);
              yield* Effect.log(jsonOutput);
            } else if (sorted.length === 0) {
              yield* Effect.log(`No ${config.displayName.toLowerCase()}s found.`);
            } else {
              yield* Effect.log(`${config.displayName}s:`);
              for (const file of sorted) {
                yield* Effect.log(`  ${file}`);
              }
            }
          });

        const exportImpl = (filePaths: readonly string[], folder?: string) =>
          Effect.gen(function* () {
            const targetFolder = folder ?? config.notesFolder;

            for (const filePath of filePaths) {
              const rawContent = yield* fs
                .readFile(filePath)
                .pipe(Effect.map((i) => new TextDecoder().decode(i)));

              const { frontmatter, content } = parseFrontmatter(rawContent);

              if (frontmatter['apple_note_id'] !== undefined) {
                yield* Effect.log(`Skipped (already exported): ${filePath}`);
                continue;
              }

              const { noteId } = yield* makeAppleNoteFromMarkdown(content, {
                folder: targetFolder,
              });

              const updated = updateFrontmatter(rawContent, { apple_note_id: noteId });
              yield* fs.writeFile(filePath, new TextEncoder().encode(updated));

              yield* Effect.log(`Exported: ${filePath} -> ${noteId}`);
            }
          });

        const syncImpl = (filePaths: readonly string[]) =>
          Effect.gen(function* () {
            const targetFolder = config.notesFolder;

            for (const filePath of filePaths) {
              const rawContent = yield* fs
                .readFile(filePath)
                .pipe(Effect.map((i) => new TextDecoder().decode(i)));

              const { frontmatter, content } = parseFrontmatter(rawContent);
              const appleNoteId = frontmatter['apple_note_id'];

              if (typeof appleNoteId === 'string') {
                yield* updateAppleNoteFromMarkdown(appleNoteId, content);
                yield* Effect.log(`Synced (updated): ${filePath}`);
              } else {
                const { noteId } = yield* makeAppleNoteFromMarkdown(content, {
                  folder: targetFolder,
                });
                const updated = updateFrontmatter(rawContent, { apple_note_id: noteId });
                yield* fs.writeFile(filePath, new TextEncoder().encode(updated));
                yield* Effect.log(`Synced (created): ${filePath} -> ${noteId}`);
              }
            }
          });

        const deleteNotesImpl = (filePaths: readonly string[]) =>
          Effect.gen(function* () {
            for (const filePath of filePaths) {
              const rawContent = yield* fs
                .readFile(filePath)
                .pipe(Effect.map((i) => new TextDecoder().decode(i)));

              const { frontmatter } = parseFrontmatter(rawContent);
              const appleNoteId = frontmatter['apple_note_id'];

              if (typeof appleNoteId !== 'string') {
                yield* Effect.log(`Skipped (no apple_note_id): ${filePath}`);
                continue;
              }

              yield* deleteNote(appleNoteId);

              const updated = removeFrontmatterFields(rawContent, ['apple_note_id']);
              yield* fs.writeFile(filePath, new TextEncoder().encode(updated));

              yield* Effect.log(`Deleted note and removed apple_note_id: ${filePath}`);
            }
          });

        return ContentService.of({
          list,
          export: exportImpl,
          sync: syncImpl,
          deleteNotes: deleteNotesImpl,
        });
      }),
    );
}

// Helper: sort files based on strategy
const sortFiles = (files: string[], strategy: SortStrategy): string[] =>
  Match.value(strategy).pipe(
    Match.tag('date-desc', () => [...files].sort((a, b) => b.localeCompare(a))),
    Match.tag('chapter-asc', () =>
      [...files].sort((a, b) => {
        const numA = parseInt(a.match(/chapter-(\d+)/)?.[1] || '0', 10);
        const numB = parseInt(b.match(/chapter-(\d+)/)?.[1] || '0', 10);
        return numA - numB;
      }),
    ),
    Match.tag('year-quarter-week', () => [...files].sort((a, b) => a.localeCompare(b))),
    Match.exhaustive,
  );
