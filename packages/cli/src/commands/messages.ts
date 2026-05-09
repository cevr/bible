import { Command } from 'effect/unstable/cli';
import { Effect, FileSystem, Option } from 'effect';
import { join } from 'path';

import { MessagesConfig } from '~/src/lib/content/configs';
import {
  makeDeleteCommand,
  makeListCommand,
  makeExportCommand,
  makeSyncCommand,
} from '~/src/lib/content/commands';
import { dryRun } from '~/src/lib/content/options';
import { parseFrontmatter, updateFrontmatter } from '~/src/lib/frontmatter';
import { findNoteByTitle } from '~/src/lib/notes-utils';
import { extractTitleFromMarkdown } from '~/src/lib/apple-notes-utils';
import { getOutputsPath } from '~/src/lib/paths';

const linkMessages = Command.make('link', { dryRun }, (args) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const messagesDir = getOutputsPath('messages');
    const files = yield* fs
      .readDirectory(messagesDir)
      .pipe(Effect.catch(() => Effect.succeed([] as string[])));

    const mdFiles = files.filter((f) => f.endsWith('.md')).map((file) => join(messagesDir, file));

    if (mdFiles.length === 0) {
      yield* Effect.log('No messages found to sync.');
      return;
    }

    yield* Effect.log(`Found ${mdFiles.length} message files to check...`);

    let synced = 0;
    let skipped = 0;
    let notFound = 0;

    for (const filePath of mdFiles) {
      const rawContent = yield* fs
        .readFile(filePath)
        .pipe(Effect.map((i) => new TextDecoder().decode(i)));

      const { frontmatter, content } = parseFrontmatter<{ apple_note_id?: string }>(rawContent);

      // Skip if already has apple_note_id
      if (frontmatter.apple_note_id !== undefined) {
        skipped++;
        continue;
      }

      // Extract title from markdown content
      const titleOption = extractTitleFromMarkdown(content);
      if (Option.isNone(titleOption)) {
        yield* Effect.log(`No title found in ${filePath.split('/').pop()}`);
        notFound++;
        continue;
      }

      const title = titleOption.value;

      // Search for matching note in Apple Notes
      const noteIdOption = yield* findNoteByTitle(title, 'messages');

      if (Option.isNone(noteIdOption)) {
        yield* Effect.log(`No matching note for: ${title}`);
        notFound++;
        continue;
      }

      const foundNoteId = noteIdOption.value;

      if (args.dryRun) {
        yield* Effect.log(`Would sync: ${title} -> ${foundNoteId}`);
        synced++;
        continue;
      }

      // Update frontmatter with the found note ID
      const updatedContent = updateFrontmatter(rawContent, {
        apple_note_id: foundNoteId,
      });
      yield* fs.writeFile(filePath, new TextEncoder().encode(updatedContent));
      yield* Effect.log(`Synced: ${title} -> ${foundNoteId}`);
      synced++;
    }

    yield* Effect.log('');
    yield* Effect.log('Sync complete:');
    yield* Effect.log(`  Synced: ${synced}`);
    yield* Effect.log(`  Skipped (already synced): ${skipped}`);
    yield* Effect.log(`  Not found in Notes: ${notFound}`);
  }),
);

export const messages = Command.make('messages').pipe(
  Command.withSubcommands([
    linkMessages,
    makeSyncCommand(MessagesConfig),
    makeListCommand(MessagesConfig),
    makeExportCommand(MessagesConfig),
    makeDeleteCommand(MessagesConfig),
  ]),
);
