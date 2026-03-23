import { Command } from '@effect/cli';
import { FileSystem } from '@effect/platform';
import { format } from 'date-fns';
import { Data, Effect, Option, Schedule } from 'effect';
import { join } from 'path';

import { MessagesConfig } from '~/src/lib/content/configs';
import {
  makeDeleteCommand,
  makeListCommand,
  makeReviseCommand,
  makeExportCommand,
  makeSyncCommand,
} from '~/src/lib/content/commands';
import { MessageFrontmatter } from '~/src/lib/content/schemas';
import { topic, noteId, dryRun } from '~/src/lib/content/options';
import { parseFrontmatter, stringifyFrontmatter, updateFrontmatter } from '~/src/lib/frontmatter';
import { msToMinutes, spin } from '~/src/lib/general';
import { generate } from '~/src/lib/generate';
import { makeAppleNoteFromMarkdown } from '~/src/lib/markdown-to-notes';
import { findNoteByTitle, getNoteContent } from '~/src/lib/notes-utils';
import { extractTitleFromMarkdown } from '~/src/lib/apple-notes-utils';
import { getOutputsPath, getPromptPath } from '~/src/lib/paths';
import { generateTopicPrompt } from '~/src/prompts/messages/generate-topic';
import { AI } from '~/src/services/ai';
import { requiredModel } from '~/src/services/model';

const generateMessage = Command.make('generate', { topic, model: requiredModel }, (args) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const startTime = Date.now();

    yield* Effect.logDebug(`topic: ${args.topic}`);

    const systemPrompt = yield* fs
      .readFile(getPromptPath('messages', 'generate.md'))
      .pipe(Effect.map((i) => new TextDecoder().decode(i)));

    const { filename, response } = yield* generate(systemPrompt, args.topic);

    const messagesDir = getOutputsPath('messages');

    const fileName = `${format(new Date(), 'yyyy-MM-dd')}-${filename}.md`;
    const filePath = join(messagesDir, fileName);

    // Create frontmatter
    const frontmatter = new MessageFrontmatter({
      created_at: new Date().toISOString(),
      topic: args.topic,
      apple_note_id: Option.none(),
    });

    yield* spin(
      'Ensuring messages directory exists',
      fs.makeDirectory(messagesDir).pipe(Effect.ignore),
    );

    // Write initial file with frontmatter (without apple_note_id yet)
    const contentWithFrontmatter = stringifyFrontmatter(
      {
        created_at: frontmatter.created_at,
        topic: frontmatter.topic,
      },
      response,
    );
    yield* spin(
      'Writing message to file: ' + fileName,
      fs.writeFile(filePath, new TextEncoder().encode(contentWithFrontmatter)),
    );

    // Export to Apple Notes and get the note ID
    const { noteId } = yield* spin(
      'Adding message to notes',
      makeAppleNoteFromMarkdown(response, { folder: 'messages' }),
    );

    // Update file with apple_note_id in frontmatter
    const finalContent = updateFrontmatter(contentWithFrontmatter, {
      apple_note_id: noteId,
    });
    yield* fs.writeFile(filePath, new TextEncoder().encode(finalContent));

    const totalTime = msToMinutes(Date.now() - startTime);
    yield* Effect.log(`Message generated successfully! (Total time: ${totalTime})`);
    yield* Effect.log(`Output: ${filePath}`);
  }),
).pipe(Command.provide((args) => AI.fromModel(args.model)));

const generateFromNoteMessage = Command.make(
  'from-note',
  { noteId, model: requiredModel },
  (args) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const startTime = Date.now();
      const note = yield* getNoteContent(args.noteId);

      const systemPrompt = yield* fs
        .readFile(getPromptPath('messages', 'generate.md'))
        .pipe(Effect.map((i) => new TextDecoder().decode(i)));

      const { filename, response } = yield* generate(systemPrompt, note);

      const messagesDir = getOutputsPath('messages');

      const fileName = `${format(new Date(), 'yyyy-MM-dd')}-${filename}.md`;
      const filePath = join(messagesDir, fileName);

      // Create frontmatter
      const frontmatter = new MessageFrontmatter({
        created_at: new Date().toISOString(),
        topic: `from-note:${args.noteId}`,
        apple_note_id: Option.none(),
      });

      yield* spin(
        'Ensuring messages directory exists',
        fs.makeDirectory(messagesDir).pipe(Effect.ignore),
      );

      // Write initial file with frontmatter
      const contentWithFrontmatter = stringifyFrontmatter(
        {
          created_at: frontmatter.created_at,
          topic: frontmatter.topic,
        },
        response,
      );
      yield* spin(
        'Writing message to file: ' + fileName,
        fs.writeFile(filePath, new TextEncoder().encode(contentWithFrontmatter)),
      );

      // Export to Apple Notes and get the note ID
      const { noteId: appleNoteId } = yield* spin(
        'Adding message to notes',
        makeAppleNoteFromMarkdown(response, { folder: 'messages' }),
      );

      // Update file with apple_note_id in frontmatter
      const finalContent = updateFrontmatter(contentWithFrontmatter, {
        apple_note_id: appleNoteId,
      });
      yield* fs.writeFile(filePath, new TextEncoder().encode(finalContent));

      const totalTime = msToMinutes(Date.now() - startTime);
      yield* Effect.log(`Message generated successfully! (Total time: ${totalTime})`);
      yield* Effect.log(`Output: ${filePath}`);
    }),
).pipe(Command.provide((args) => AI.fromModel(args.model)));

class GenerateTopicResponseError extends Data.TaggedError(
  '@bible/cli/commands/messages/GenerateTopicResponseError',
)<{
  cause: unknown;
}> {}

const generateTopic = Command.make('generate-topic', { model: requiredModel }, () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const ai = yield* AI;

    const previousMessages = yield* fs.readDirectory(getOutputsPath('messages'));

    const systemPrompt = generateTopicPrompt(previousMessages);

    const response = yield* spin(
      'Generating...',
      ai
        .generateText({
          model: 'high',
          messages: [{ role: 'system', content: systemPrompt }],
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new GenerateTopicResponseError({
                cause,
              }),
          ),
          Effect.retry({
            times: 3,
            schedule: Schedule.spaced(500),
          }),
        ),
    );

    const message = response.text;
    yield* Effect.log(`topic: \n\n ${message}`);
  }),
).pipe(Command.provide((args) => AI.fromModel(args.model)));

const syncMessages = Command.make('link', { dryRun }, (args) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    const messagesDir = getOutputsPath('messages');
    const files = yield* fs
      .readDirectory(messagesDir)
      .pipe(Effect.catchAll(() => Effect.succeed([] as string[])));

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
    generateMessage,
    generateFromNoteMessage,
    generateTopic,
    syncMessages,
    makeReviseCommand(MessagesConfig),
    makeSyncCommand(MessagesConfig),
    makeListCommand(MessagesConfig),
    makeExportCommand(MessagesConfig),
    makeDeleteCommand(MessagesConfig),
  ]),
);
