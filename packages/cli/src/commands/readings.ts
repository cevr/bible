import { Argument, Command } from 'effect/unstable/cli';
import { Effect, FileSystem, Option } from 'effect';
import { join } from 'path';

import { ReadingsConfig } from '~/src/lib/content/configs';
import {
  makeDeleteCommand,
  makeListCommand,
  makeReviseCommand,
  makeExportCommand,
  makeSyncCommand,
} from '~/src/lib/content/commands';
import { type AppleNoteId, ReadingFrontmatter } from '~/src/lib/content/schemas';
import { parseFrontmatter, stringifyFrontmatter } from '~/src/lib/frontmatter';
import { msToMinutes, spin } from '~/src/lib/general';
import { generate } from '~/src/lib/generate';
import { getCliRoot, getOutputsPath } from '~/src/lib/paths';
import { readingsGenerateStudyPrompt } from '~/src/prompts';
import { AI } from '~/src/services/ai';
import { requiredModel } from '~/src/services/model';

const chapter = Argument.integer('chapter').pipe(Argument.optional);

const processChapters = Command.make('process', { chapter, model: requiredModel }, (args) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const startTime = Date.now();

    const chaptersDir = join(getCliRoot(), '..', 'scripts', 'extracted-chapters');
    const outputDir = getOutputsPath('readings');

    yield* spin(
      'Ensuring output directory exists',
      fs.makeDirectory(outputDir).pipe(Effect.ignore),
    );

    const studyPrompt = readingsGenerateStudyPrompt;

    const files = yield* fs.readDirectory(chaptersDir);

    const allChapterFiles = files
      .filter((file) => file.startsWith('chapter-') && file.endsWith('.txt'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/chapter-(\d+)\.txt/)?.[1] || '0', 10);
        const numB = parseInt(b.match(/chapter-(\d+)\.txt/)?.[1] || '0', 10);
        return numA - numB;
      });

    const chapterFiles = Option.match(args.chapter, {
      onSome: (num) => allChapterFiles.filter((f) => f === `chapter-${num}.txt`),
      onNone: () => allChapterFiles,
    });

    // Specific chapter = force overwrite; otherwise skip existing
    const forceOverwrite = Option.isSome(args.chapter);

    const chaptersToProcess = forceOverwrite
      ? chapterFiles
      : yield* Effect.filter(
          chapterFiles,
          (chapterFile) =>
            Effect.gen(function* () {
              const chapterNum = chapterFile.match(/chapter-(\d+)\.txt/)?.[1] || '0';
              const studyFile = join(outputDir, `chapter-${chapterNum}.md`);
              return !(yield* fs.exists(studyFile));
            }),
          { concurrency: 'unbounded' },
        );

    if (chaptersToProcess.length === 0) {
      yield* Effect.log('All chapters have already been processed!');
      return;
    }

    yield* Effect.log(
      `Processing ${chaptersToProcess.length} chapters (${allChapterFiles.length - chaptersToProcess.length} already completed)`,
    );

    yield* Effect.forEach(
      chaptersToProcess,
      (chapterFile, index) =>
        Effect.gen(function* () {
          const chapterNum = parseInt(chapterFile.match(/chapter-(\d+)\.txt/)?.[1] || '0', 10);
          const chapterPath = join(chaptersDir, chapterFile);
          const studyOutputFile = join(outputDir, `chapter-${chapterNum}.md`);

          yield* Effect.log(
            `[${index + 1}/${chaptersToProcess.length}] Processing ${chapterFile}...`,
          );

          // Preserve existing apple_note_id
          const exists = yield* fs.exists(studyOutputFile);
          let existingNoteId: Option.Option<AppleNoteId>;
          if (exists) {
            const raw = yield* fs
              .readFile(studyOutputFile)
              .pipe(Effect.map((i) => new TextDecoder().decode(i)));
            const { frontmatter } = parseFrontmatter(raw);
            existingNoteId = Option.fromNullishOr(
              frontmatter['apple_note_id'] as AppleNoteId | undefined,
            );
          } else {
            existingNoteId = Option.none<AppleNoteId>();
          }

          const chapterContent = yield* fs
            .readFile(chapterPath)
            .pipe(Effect.map((i) => new TextDecoder().decode(i)));

          const { response: studyContent } = yield* generate(studyPrompt, chapterContent, {
            skipChime: true,
          });

          const frontmatter = new ReadingFrontmatter({
            created_at: new Date().toISOString(),
            chapter: chapterNum,
            apple_note_id: existingNoteId,
          });
          const finalContent = stringifyFrontmatter(
            {
              created_at: frontmatter.created_at,
              chapter: frontmatter.chapter,
              ...(Option.isSome(existingNoteId) ? { apple_note_id: existingNoteId.value } : {}),
            },
            studyContent,
          );

          yield* spin(
            `Writing study to ${studyOutputFile}`,
            fs.writeFile(studyOutputFile, new TextEncoder().encode(finalContent)),
          );
        }).pipe(
          Effect.annotateLogs({
            chapter: chapterFile,
            current: index + 1,
            total: chaptersToProcess.length,
          }),
        ),
      { concurrency: 1 },
    );

    const totalTime = msToMinutes(Date.now() - startTime);
    yield* Effect.log(`\nAll chapters processed successfully! (Total time: ${totalTime})`);
  }),
).pipe(Command.provide((args) => AI.fromModel(args.model)));

export const readings = Command.make('readings').pipe(
  Command.withSubcommands([
    processChapters,
    makeReviseCommand(ReadingsConfig),
    makeSyncCommand(ReadingsConfig),
    makeListCommand(ReadingsConfig),
    makeExportCommand(ReadingsConfig),
    makeDeleteCommand(ReadingsConfig),
  ]),
);
