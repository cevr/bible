import { Command, Flag } from 'effect/unstable/cli';
import { Console, Effect, FileSystem } from 'effect';

import { file, files, folder, json, noteId } from '~/src/lib/content/options';
import { parseFrontmatter, type MessageFrontmatter } from '~/src/lib/frontmatter';
import {
  makeAppleNoteFromMarkdown,
  moveAppleNoteToFolder,
  updateAppleNoteFromMarkdown,
} from '~/src/lib/markdown-to-notes';
import { listNotes } from '~/src/lib/notes-utils';

const list = Command.make('list', { json }, (args) =>
  Effect.gen(function* () {
    const notes = yield* listNotes();
    if (args.json) {
      const jsonOutput = JSON.stringify(notes, null, 2);
      yield* Console.log(jsonOutput);
    } else {
      if (notes.length === 0) {
        yield* Console.log('No notes found.');
        return;
      }

      yield* Console.log('Recent Apple Notes:\n');
      yield* Console.log(
        'ID                                                              | Name                                     | Modified',
      );
      yield* Console.log(
        '----------------------------------------------------------------|------------------------------------------|--------------------',
      );

      for (const note of notes) {
        const id = note.id.length > 64 ? note.id.slice(0, 61) + '...' : note.id.padEnd(64);
        const name = note.name.length > 40 ? note.name.slice(0, 37) + '...' : note.name.padEnd(40);
        const modified = note.modificationDate.slice(0, 20);
        yield* Console.log(`${id}| ${name}| ${modified}`);
      }

      yield* Console.log(`\nTotal: ${notes.length} notes (showing most recent 20)`);
    }
  }),
);

const optionalNoteId = noteId.pipe(Flag.optional);

const exportNote = Command.make('export', { file, noteId: optionalNoteId, folder }, (args) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;

    yield* Effect.log(`Reading file: ${args.file}`);
    const content = yield* fileSystem.readFile(args.file);
    const markdownContent = new TextDecoder().decode(content);

    if (args.noteId._tag === 'Some') {
      // Update existing note
      yield* Effect.log(`Updating existing note: ${args.noteId.value}`);
      const title = yield* updateAppleNoteFromMarkdown(args.noteId.value, markdownContent);
      yield* Console.log(`Updated note: "${title}"`);
    } else {
      // Create new note
      const folderName = args.folder._tag === 'Some' ? args.folder.value : undefined;
      yield* Effect.log(
        `Creating new note${folderName !== undefined ? ` in folder "${folderName}"` : ''}...`,
      );
      const title = yield* makeAppleNoteFromMarkdown(markdownContent, {
        folder: folderName,
      });
      yield* Console.log(`Created note: "${title}"`);
    }
  }),
);

const requiredFolder = Flag.string('folder').pipe(
  Flag.withDescription('Target folder in Apple Notes'),
);

const organize = Command.make('organize', { files, folder: requiredFolder }, (args) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;

    if (args.files.length === 0) {
      yield* Effect.logError('No files specified. Use --files or -f to specify files to organize.');
      return;
    }

    yield* Effect.log(
      `Organizing ${args.files.length} file(s) into Apple Notes folder "${args.folder}"...`,
    );

    let moved = 0;
    let skipped = 0;
    for (const filePath of args.files) {
      const rawContent = yield* fileSystem
        .readFile(filePath)
        .pipe(Effect.map((i) => new TextDecoder().decode(i)));

      const { frontmatter } = parseFrontmatter<MessageFrontmatter>(rawContent);
      const existingNoteId = frontmatter.apple_note_id;

      if (existingNoteId === undefined || existingNoteId === '') {
        yield* Effect.logWarning(`  Skipped: ${filePath} (no apple_note_id in frontmatter)`);
        skipped++;
        continue;
      }

      yield* moveAppleNoteToFolder(existingNoteId, args.folder);
      yield* Effect.log(`  Moved: ${filePath} → "${args.folder}"`);
      moved++;
    }

    yield* Effect.log(`Done. Moved ${moved}, skipped ${skipped}.`);
  }),
);

// Main notes command
export const notes = Command.make('notes').pipe(
  Command.withSubcommands([list, exportNote, organize]),
);
