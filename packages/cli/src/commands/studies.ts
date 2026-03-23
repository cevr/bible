import { Command } from '@effect/cli';
import { FileSystem } from '@effect/platform';
import { format } from 'date-fns';
import { Effect, Option } from 'effect';
import { join } from 'path';

import { StudiesConfig } from '~/src/lib/content/configs';
import {
  makeDeleteCommand,
  makeListCommand,
  makeReviseCommand,
  makeExportCommand,
  makeSyncCommand,
} from '~/src/lib/content/commands';
import { StudyFrontmatter } from '~/src/lib/content/schemas';
import { topic, noteId } from '~/src/lib/content/options';
import { stringifyFrontmatter, updateFrontmatter } from '~/src/lib/frontmatter';
import { msToMinutes, spin } from '~/src/lib/general';
import { bibleTools } from '~/src/lib/bible-tools';
import { generate } from '~/src/lib/generate';
import { makeAppleNoteFromMarkdown } from '~/src/lib/markdown-to-notes';
import { getNoteContent } from '~/src/lib/notes-utils';
import { getOutputsPath, getPromptPath } from '~/src/lib/paths';
import { AI } from '~/src/services/ai';
import { requiredModel } from '~/src/services/model';

const generateStudy = Command.make('generate', { topic, model: requiredModel }, (args) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const startTime = Date.now();

    yield* Effect.logDebug(`topic: ${args.topic}`);

    const systemPrompt = yield* fs
      .readFile(getPromptPath('studies', 'generate.md'))
      .pipe(Effect.map((i) => new TextDecoder().decode(i)));

    const { filename, response } = yield* generate(systemPrompt, args.topic, {
      tools: bibleTools,
      maxSteps: 20,
    });

    const studiesDir = getOutputsPath('studies');

    const fileName = `${format(new Date(), 'yyyy-MM-dd')}-${filename}.md`;
    const filePath = join(studiesDir, fileName);

    // Create frontmatter
    const frontmatter = new StudyFrontmatter({
      created_at: new Date().toISOString(),
      topic: args.topic,
      apple_note_id: Option.none(),
    });

    yield* spin(
      'Ensuring studies directory exists',
      fs.makeDirectory(studiesDir).pipe(Effect.ignore),
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
      'Writing study to file: ' + fileName,
      fs.writeFile(filePath, new TextEncoder().encode(contentWithFrontmatter)),
    );

    // Export to Apple Notes and get the note ID
    const { noteId } = yield* spin(
      'Adding study to notes',
      makeAppleNoteFromMarkdown(response, { folder: 'studies' }),
    );

    // Update file with apple_note_id in frontmatter
    const finalContent = updateFrontmatter(contentWithFrontmatter, {
      apple_note_id: noteId,
    });
    yield* fs.writeFile(filePath, new TextEncoder().encode(finalContent));

    const totalTime = msToMinutes(Date.now() - startTime);
    yield* Effect.log(`Study generated successfully! (Total time: ${totalTime})`);
    yield* Effect.log(`Output: ${filePath}`);
  }),
).pipe(Command.provide((args) => AI.fromModel(args.model)));

const generateFromNoteStudy = Command.make('from-note', { noteId, model: requiredModel }, (args) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const startTime = Date.now();

    const note = yield* getNoteContent(args.noteId);

    const systemPrompt = yield* fs
      .readFile(getPromptPath('studies', 'generate.md'))
      .pipe(Effect.map((i) => new TextDecoder().decode(i)));

    const { filename, response } = yield* generate(systemPrompt, note, {
      tools: bibleTools,
      maxSteps: 20,
    });

    const studiesDir = getOutputsPath('studies');

    const fileName = `${format(new Date(), 'yyyy-MM-dd')}-${filename}.md`;
    const filePath = join(studiesDir, fileName);

    // Create frontmatter
    const frontmatter = new StudyFrontmatter({
      created_at: new Date().toISOString(),
      topic: `from-note:${args.noteId}`,
      apple_note_id: Option.none(),
    });

    // Write initial file with frontmatter
    const contentWithFrontmatter = stringifyFrontmatter(
      {
        created_at: frontmatter.created_at,
        topic: frontmatter.topic,
      },
      response,
    );
    yield* spin(
      'Writing study to file: ' + fileName,
      fs.writeFile(filePath, new TextEncoder().encode(contentWithFrontmatter)),
    );

    // Export to Apple Notes and get the note ID
    const { noteId: appleNoteId } = yield* spin(
      'Adding study to notes',
      makeAppleNoteFromMarkdown(response, { folder: 'studies' }),
    );

    // Update file with apple_note_id in frontmatter
    const finalContent = updateFrontmatter(contentWithFrontmatter, {
      apple_note_id: appleNoteId,
    });
    yield* fs.writeFile(filePath, new TextEncoder().encode(finalContent));

    const totalTime = msToMinutes(Date.now() - startTime);
    yield* Effect.log(`Study generated successfully! (Total time: ${totalTime})`);
    yield* Effect.log(`Output: ${filePath}`);
  }),
).pipe(Command.provide((args) => AI.fromModel(args.model)));

export const studies = Command.make('studies').pipe(
  Command.withSubcommands([
    generateStudy,
    generateFromNoteStudy,
    makeReviseCommand(StudiesConfig),
    makeSyncCommand(StudiesConfig),
    makeListCommand(StudiesConfig),
    makeExportCommand(StudiesConfig),
    makeDeleteCommand(StudiesConfig),
  ]),
);
