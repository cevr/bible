#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, FileSystem, Path, Schema } from 'effect';
import { Argument, Command } from 'effect/unstable/cli';
import { PDFParse } from 'pdf-parse';

const pdfPathArgument = Argument.file('pdf-path').pipe(
  Argument.withDescription('Path to the PDF file to parse (or .txt file for testing)'),
);

const outputDirectoryArgument = Argument.directory('output-dir').pipe(
  Argument.withDefault('./extracted-chapters'),
  Argument.withDescription('Directory where chapter files will be created'),
);

interface Chapter {
  readonly number: number;
  readonly title: string;
  readonly content: string;
}

class PdfParseError extends Schema.TaggedErrorClass<PdfParseError>()('PdfParseError', {
  message: Schema.String,
  cause: Schema.Unknown,
}) {}

class FileWriteError extends Schema.TaggedErrorClass<FileWriteError>()('FileWriteError', {
  message: Schema.String,
  cause: Schema.Unknown,
  filePath: Schema.String,
}) {}

const parsePdfContent = Effect.fn('parsePdfContent')(function* (filePath: string) {
  const fs = yield* FileSystem.FileSystem;
  const data = yield* fs.readFile(filePath);

  return yield* Effect.acquireUseRelease(
    Effect.sync(() => new PDFParse({ data })),
    (parser) =>
      Effect.tryPromise({
        try: () => parser.getText(),
        catch: (cause) => new PdfParseError({ message: 'Failed to parse file', cause }),
      }).pipe(Effect.map((result) => result.text)),
    (parser) =>
      Effect.tryPromise({
        try: () => parser.destroy(),
        catch: (cause) => new PdfParseError({ message: 'Failed to release PDF parser', cause }),
      }).pipe(Effect.ignore),
  );
});

const chapterPattern = /Chapter\s+(\d+)/giu;

const cleanPageNumbers = (content: string): string =>
  content
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (/^--\s+\d+\s+of\s+\d+\s+--$/u.test(trimmed)) return false;
      if (/^\d+$/u.test(trimmed)) return false;
      return true;
    })
    .join('\n');

const extractChapters = (content: string): readonly Chapter[] => {
  const chapters: Chapter[] = [];
  const matches = [...content.matchAll(chapterPattern)];
  matches.sort((left, right) => left.index - right.index);
  const uniqueMatches = matches.filter((match, index, allMatches) => {
    if (index === 0) return true;
    const previous = allMatches[index - 1];
    if (previous === undefined) return true;
    return match.index !== previous.index;
  });

  for (let index = 0; index < uniqueMatches.length; index += 1) {
    const match = uniqueMatches[index];
    if (match === undefined) continue;
    const chapterNumberText = match[1];
    if (chapterNumberText === undefined) continue;

    const nextMatch = uniqueMatches[index + 1];
    let endIndex = content.length;
    if (nextMatch !== undefined) endIndex = nextMatch.index;
    const chapterNumber = +chapterNumberText;
    chapters.push({
      number: chapterNumber,
      title: `Chapter ${chapterNumber}`,
      content: cleanPageNumbers(content.slice(match.index, endIndex).trim()),
    });
  }

  if (chapters.length === 0) {
    chapters.push({
      number: 1,
      title: 'Chapter 1',
      content: cleanPageNumbers(content.trim()),
    });
  }

  return chapters.sort((left, right) => left.number - right.number);
};

const extractTitleAndCleanContent = (
  content: string,
  chapterNumber: number,
): { readonly title: string; readonly cleanedContent: string } => {
  const lines = content.split('\n');
  const chapterHeader = `Chapter ${chapterNumber}`;
  let title = chapterHeader;
  let startIndex = 0;
  const firstLine = lines[0];

  if (firstLine !== undefined && firstLine.trim().toLowerCase() === chapterHeader.toLowerCase()) {
    startIndex = 1;
    const secondLine = lines[1];
    if (secondLine !== undefined) {
      const potentialTitle = secondLine.trim();
      if (potentialTitle !== '' && potentialTitle.toLowerCase() !== chapterHeader.toLowerCase()) {
        title = potentialTitle;
        startIndex = 2;
      }
    }
  }

  const cleanedContent = lines
    .slice(startIndex)
    .join('\n')
    .replace(/\n\s*\n\s*\n/gu, '\n\n')
    .replace(/[\r\n]+/gu, '\n')
    .trim();

  return { title, cleanedContent };
};

const dividerLength = (title: string, chapterTitle: string): number => {
  if (title.length >= chapterTitle.length) return title.length;
  return chapterTitle.length;
};

const writeChapterFile = Effect.fn('writeChapterFile')(function* (
  chapter: Chapter,
  outputDirectory: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const fileName = `chapter-${chapter.number.toString().padStart(2, '0')}.txt`;
  const filePath = pathService.join(outputDirectory, fileName);
  const { title, cleanedContent } = extractTitleAndCleanContent(chapter.content, chapter.number);
  const divider = '='.repeat(dividerLength(title, chapter.title));
  const content = `${chapter.title}\n${title}\n${divider}\n\n${cleanedContent}`;

  yield* fs
    .writeFileString(filePath, content)
    .pipe(
      Effect.mapError(
        (cause) => new FileWriteError({ message: 'Failed to write chapter file', cause, filePath }),
      ),
    );
  yield* Console.log(`✓ Created: ${fileName}`);
});

const processPdf = Effect.fn('processPdf')(function* (pdfPath: string, outputDirectory: string) {
  const fs = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const fileExists = yield* fs.exists(pdfPath);
  if (!fileExists) {
    return yield* Effect.fail(
      new PdfParseError({ message: `PDF file not found: ${pdfPath}`, cause: 'File not found' }),
    );
  }

  yield* fs.makeDirectory(outputDirectory, { recursive: true });
  yield* Console.log(`📖 Parsing PDF: ${pdfPath}`);
  const content = yield* parsePdfContent(pdfPath);
  yield* Console.log('🔍 Extracting chapters...');
  const chapters = extractChapters(content);
  yield* Console.log(`📚 Found ${chapters.length} chapters`);
  yield* Console.log('💾 Saving chapter files...');
  yield* Effect.forEach(chapters, (chapter) => writeChapterFile(chapter, outputDirectory), {
    concurrency: 1,
    discard: true,
  });
  yield* Console.log(`✅ Successfully extracted ${chapters.length} chapters to ${outputDirectory}`);
  yield* Console.log(`📂 Output directory: ${pathService.resolve(outputDirectory)}`);
});

const parseBibleReadings = Command.make(
  'parse-bible-readings',
  { pdfPath: pdfPathArgument, outputDir: outputDirectoryArgument },
  ({ pdfPath, outputDir }) =>
    processPdf(pdfPath, outputDir).pipe(
      Effect.catchTags({
        PdfParseError: (error) => Console.error(`❌ PDF Parse Error: ${error.message}`),
        FileWriteError: (error) =>
          Console.error(`❌ File Write Error: ${error.message} - ${error.filePath}`),
      }),
      Effect.catchCause((cause) => Console.error('❌ Unexpected error:', cause)),
    ),
);

Command.run(parseBibleReadings, { version: 'v1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
