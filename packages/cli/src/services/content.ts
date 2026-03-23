import { FileSystem } from '@effect/platform';
import type * as PlatformError from '@effect/platform/Error';
import type { Cause, ParseResult } from 'effect';
import { Context, Effect, Layer, Match, Schema } from 'effect';
import { join } from 'path';

import type { ContentTypeConfig, SortStrategy } from '~/src/lib/content/types';
import {
  parseFrontmatter,
  removeFrontmatterFields,
  stringifyFrontmatter,
  updateFrontmatter,
} from '~/src/lib/frontmatter';
import { getOutputsPath, getPromptPath } from '~/src/lib/paths';
import { revise, type ReviewError } from '~/src/lib/revise';
import {
  makeAppleNoteFromMarkdown,
  updateAppleNoteFromMarkdown,
  type MarkdownParseError,
} from '~/src/lib/markdown-to-notes';
import { deleteNote, type NoteOperationError } from '~/src/lib/notes-utils';
import type { AI } from '~/src/services/ai';
import type { AppleScript } from '~/src/services/apple-script';
import type { Chime } from '~/src/services/chime';

type ContentListError = ParseResult.ParseError;
type ContentReviseError =
  | ParseResult.ParseError
  | PlatformError.PlatformError
  | MarkdownParseError
  | ReviewError
  | Cause.UnknownException;
type ContentExportError =
  | ParseResult.ParseError
  | PlatformError.PlatformError
  | MarkdownParseError
  | Cause.UnknownException;
type ContentSyncError = PlatformError.PlatformError | MarkdownParseError | Cause.UnknownException;
type ContentDeleteError = PlatformError.PlatformError | NoteOperationError | Cause.UnknownException;

// Service interface with proper error/context types
export class ContentService extends Context.Tag('@bible/cli/services/content/ContentService')<
  ContentService,
  {
    readonly list: (json: boolean) => Effect.Effect<void, ContentListError>;
    readonly revise: (
      filePath: string,
      instructions: string,
    ) => Effect.Effect<void, ContentReviseError, AI | AppleScript | Chime>;
    readonly export: (
      filePaths: readonly string[],
      folder?: string,
    ) => Effect.Effect<void, ContentExportError, AppleScript>;
    readonly sync: (
      filePaths: readonly string[],
    ) => Effect.Effect<void, ContentSyncError, AppleScript>;
    readonly deleteNotes: (filePaths: readonly string[]) => Effect.Effect<void, ContentDeleteError>;
  }
>() {
  static make = <F extends Schema.Schema.AnyNoContext>(config: ContentTypeConfig<F>) =>
    Layer.effect(
      ContentService,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const encodeJson = Schema.encode(Schema.parseJson({ space: 2 }));

        const list = (json: boolean) =>
          Effect.gen(function* () {
            const outputDir = getOutputsPath(config.outputDir);
            const files = yield* fs
              .readDirectory(outputDir)
              .pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

            const mdFiles = files.filter((f) => f.endsWith('.md'));
            const sorted = sortFiles(mdFiles, config.sortStrategy);
            const filePaths = sorted.map((f) => join(outputDir, f));

            if (json) {
              const jsonOutput = yield* encodeJson(filePaths);
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

        const reviseImpl = (filePath: string, instructions: string) =>
          Effect.gen(function* () {
            const rawContent = yield* fs
              .readFile(filePath)
              .pipe(Effect.map((i) => new TextDecoder().decode(i)));

            const { frontmatter, content } = parseFrontmatter(rawContent);
            const systemPrompt = yield* resolvePrompt(fs, config, filePath);

            const revised = yield* revise({
              cycles: [{ prompt: '', response: content }],
              systemPrompt,
              instructions,
            });

            const finalContent =
              Object.keys(frontmatter).length > 0
                ? stringifyFrontmatter(frontmatter, revised)
                : revised;

            yield* fs.writeFile(filePath, new TextEncoder().encode(finalContent));

            // Update Apple Note if linked
            const appleNoteId = frontmatter.apple_note_id;
            if (typeof appleNoteId === 'string') {
              yield* updateAppleNoteFromMarkdown(appleNoteId, revised);
            }

            yield* Effect.log(`${config.displayName} revised: ${filePath}`);
          });

        const exportImpl = (filePaths: readonly string[], folder?: string) =>
          Effect.gen(function* () {
            const targetFolder = folder ?? config.notesFolder;

            for (const filePath of filePaths) {
              const rawContent = yield* fs
                .readFile(filePath)
                .pipe(Effect.map((i) => new TextDecoder().decode(i)));

              const { frontmatter, content } = parseFrontmatter(rawContent);

              if (frontmatter.apple_note_id !== undefined) {
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
              const appleNoteId = frontmatter.apple_note_id;

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
              const appleNoteId = frontmatter.apple_note_id;

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
          revise: reviseImpl,
          export: exportImpl,
          sync: syncImpl,
          deleteNotes: deleteNotesImpl,
        });
      }),
    );
}

// Helper: resolve prompt based on config
const resolvePrompt = <F extends Schema.Schema.AnyNoContext>(
  fs: FileSystem.FileSystem,
  config: ContentTypeConfig<F>,
  filePath: string,
) =>
  Effect.gen(function* () {
    const promptFile = Match.value(config.promptResolver).pipe(
      Match.tag('single', ({ file }) => file),
      Match.tag('from-filename', ({ patterns }) => {
        for (const [pattern, file] of Object.entries(patterns)) {
          if (filePath.includes(pattern)) return file;
        }
        return Object.values(patterns)[0] ?? ''; // fallback to first
      }),
      Match.exhaustive,
    );

    return yield* fs
      .readFile(getPromptPath(config.name, promptFile))
      .pipe(Effect.map((i) => new TextDecoder().decode(i)));
  });

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
