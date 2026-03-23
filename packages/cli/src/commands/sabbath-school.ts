import { Command, Options } from '@effect/cli';
import { FileSystem } from '@effect/platform';
import * as cheerio from 'cheerio';
import { Array, Data, Effect, Option, Schema, Stream } from 'effect';
import { dirname, join } from 'path';

import { makeDeleteCommand, makeSyncCommand } from '~/src/lib/content/commands';
import { SabbathSchoolConfig } from '~/src/lib/content/configs';
import { type AppleNoteId, SabbathSchoolFrontmatter } from '~/src/lib/content/schemas';
import { parseFrontmatter, stringifyFrontmatter, updateFrontmatter } from '~/src/lib/frontmatter';
import { msToMinutes } from '~/src/lib/general';
import { makeAppleNoteFromMarkdown } from '~/src/lib/markdown-to-notes';
import { getOutputsPath } from '~/src/lib/paths';
import {
  outlineSystemPrompt,
  outlineUserPrompt,
  reviewCheckSystemPrompt,
  reviewCheckUserPrompt,
  reviseSystemPrompt,
  reviseUserPrompt,
} from '@bible/core/sabbath-school';
import { AI } from '~/src/services/ai';
import { requiredModel } from '~/src/services/model';

class OutlineError extends Data.TaggedError('@bible/cli/commands/sabbath-school/OutlineError')<{
  context: SabbathSchoolContext;
  cause: unknown;
}> {}

class DownloadError extends Data.TaggedError('@bible/cli/commands/sabbath-school/DownloadError')<{
  week: number;
  cause: unknown;
}> {}

class CheerioError extends Data.TaggedError('@bible/cli/commands/sabbath-school/CheerioError')<{
  week: number;
  cause: unknown;
}> {}

class MissingPdfError extends Data.TaggedError(
  '@bible/cli/commands/sabbath-school/MissingPdfError',
)<{
  quarter: number;
}> {}

class ReviewError extends Data.TaggedError('@bible/cli/commands/sabbath-school/ReviewError')<{
  context: SabbathSchoolContext;
  cause: unknown;
}> {}

class ReviseError extends Data.TaggedError('@bible/cli/commands/sabbath-school/ReviseError')<{
  context: SabbathSchoolContext;
  cause: unknown;
}> {}

const year = Options.integer('year').pipe(
  Options.withAlias('y'),
  Options.withSchema(Schema.Number.pipe(Schema.lessThanOrEqualTo(new Date().getFullYear()))),
  Options.optional,
  Options.map(Option.getOrElse(() => new Date().getFullYear())),
);
const quarter = Options.integer('quarter').pipe(
  Options.withAlias('q'),
  Options.withSchema(
    Schema.Number.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(4)),
  ),
  Options.optional,
  Options.map(Option.getOrElse(() => Math.floor(new Date().getMonth() / 3) + 1)),
);

const week = Options.integer('week').pipe(
  Options.withAlias('w'),
  Options.withSchema(
    Schema.Number.pipe(Schema.greaterThanOrEqualTo(1), Schema.lessThanOrEqualTo(13)),
  ),
  Options.optional,
);

interface WeekFiles {
  lessonPdf: string;
  egwPdf: string;
}

interface WeekUrls {
  weekNumber: number;
  files: WeekFiles;
}

interface SabbathSchoolContext {
  year: number;
  quarter: number;
  week: number;
}

const findQuarterUrls = Effect.fn('findQuarterUrls')(function* (year: number, quarter: number) {
  // Parse the base URL once
  const baseUrl = `https://www.sabbath.school/LessonBook?year=${year}&quarter=${quarter}`;
  const response = yield* Effect.tryPromise({
    try: () =>
      fetch(baseUrl).then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.text();
      }),
    catch: (cause: unknown) =>
      new DownloadError({
        week: 0,
        cause,
      }),
  });

  const $ = yield* Effect.try({
    try: () => cheerio.load(response),
    catch: (cause: unknown) =>
      new CheerioError({
        week: 0,
        cause,
      }),
  });
  const weekUrls: WeekUrls[] = [];
  let currentWeek = 1;
  let currentFiles: Partial<WeekFiles> = {};

  // Find all anchor tags with the specific class
  $('a.btn-u.btn-u-sm').each((_, element) => {
    const text = $(element).text().trim();
    const href = $(element).attr('href');

    if (href === undefined) return;

    if (text === 'Teachers PDF') {
      currentFiles.lessonPdf = href;
    } else if (text === 'EGW Notes PDF') {
      currentFiles.egwPdf = href;
    }

    // If we have both files, we've completed a week
    if (currentFiles.lessonPdf !== undefined && currentFiles.egwPdf !== undefined) {
      weekUrls.push({
        weekNumber: currentWeek,
        files: {
          lessonPdf: currentFiles.lessonPdf,
          egwPdf: currentFiles.egwPdf,
        },
      });
      currentWeek++;
      currentFiles = {};
    }
  });

  // Validate that we found all weeks
  if (weekUrls.length === 0) {
    return yield* new MissingPdfError({
      quarter,
    });
  }

  return weekUrls;
});

const downloadPdf = Effect.fn('downloadPdf')(function* (url: string, cachePath: string) {
  const fs = yield* FileSystem.FileSystem;
  const exists = yield* fs.exists(cachePath);
  if (exists) {
    const bytes = yield* fs.readFile(cachePath);
    return bytes.buffer as ArrayBuffer;
  }

  const buffer = yield* Effect.tryPromise({
    try: () =>
      fetch(url).then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.arrayBuffer();
      }),
    catch: (cause: unknown) =>
      new DownloadError({
        week: 0,
        cause,
      }),
  });

  yield* fs.makeDirectory(dirname(cachePath), { recursive: true });
  yield* fs.writeFile(cachePath, new Uint8Array(buffer));

  return buffer;
});

const getFilePath = (year: number, quarter: number, week: number) => {
  const outputDir = getOutputsPath('sabbath-school');
  return join(outputDir, `${year}-Q${quarter}-W${week}.md`);
};

const getPdfPath = (year: number, quarter: number, week: number, type: 'lesson' | 'egw') => {
  const pdfDir = getOutputsPath('sabbath-school', 'pdfs');
  return join(pdfDir, `${year}-Q${quarter}-W${week}-${type}.pdf`);
};

const reviseOutline = Effect.fn('reviseOutline')(function* (
  context: SabbathSchoolContext,
  text: string,
) {
  const ai = yield* AI;

  yield* Effect.log(`Checking if revision is needed...`);
  const reviewResponse = yield* ai
    .generateObject({
      model: 'high',
      messages: [
        { role: 'system', content: reviewCheckSystemPrompt },
        { role: 'user', content: reviewCheckUserPrompt(text) },
      ],
      schema: Schema.Struct({
        needsRevision: Schema.Boolean.annotations({
          description: 'Whether the outline needs revision',
        }),
        revisionPoints: Schema.Array(Schema.String).annotations({
          description: 'Specific points where the outline FAILS to meet the prompt requirements',
        }),
        comments: Schema.String.annotations({
          description:
            'Brief overall comment on the adherence or specific strengths/weaknesses, keep it concise. Use empty string if no comments.',
        }),
      }),
    })
    .pipe(
      Effect.mapError(
        (cause) =>
          new ReviewError({
            context,
            cause,
          }),
      ),
    );

  const needsRevision = reviewResponse.object.needsRevision;

  yield* Effect.log(`Revision needed: ${needsRevision}`);
  if (!needsRevision) {
    return Option.none<string>();
  }

  yield* Effect.log(`Revising outline...`);

  const revisedOutline = yield* ai
    .generateText({
      model: 'high',
      messages: [
        { role: 'system', content: outlineSystemPrompt },
        { role: 'system', content: reviseSystemPrompt },
        { role: 'user', content: reviseUserPrompt(reviewResponse.object, text) },
      ],
    })
    .pipe(
      Effect.mapError(
        (cause) =>
          new ReviseError({
            context,
            cause,
          }),
      ),
    );

  return Option.some(revisedOutline.text);
});

const generateOutline = Effect.fn('generateOutline')(function* (
  context: {
    year: number;
    quarter: number;
    week: number;
  },
  lessonPdfBuffer: ArrayBuffer,
  egwPdfBuffer: ArrayBuffer,
) {
  const ai = yield* AI;

  yield* Effect.log(`Generating outline...`);

  const response = yield* ai
    .generateText({
      model: 'high',
      messages: [
        { role: 'system', content: outlineSystemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: outlineUserPrompt(context) },
            { type: 'file', mediaType: 'application/pdf', data: lessonPdfBuffer },
            { type: 'file', mediaType: 'application/pdf', data: egwPdfBuffer },
          ],
        },
      ],
    })
    .pipe(
      Effect.mapError(
        (cause) =>
          new OutlineError({
            context,
            cause,
          }),
      ),
    );

  return response.text;
});

const force = Options.boolean('force').pipe(Options.withAlias('f'), Options.withDefault(false));

const processQuarter = Command.make(
  'process',
  { year, quarter, week, model: requiredModel, force },
  ({ year, quarter, week, force }) =>
    Effect.gen(function* () {
      yield* Effect.log(
        `Starting download for Q${quarter} ${year}${
          Option.isSome(week) ? ` Week ${week.value}` : ''
        }${force ? ' (force)' : ''}`,
      );

      const weeks = Option.match(week, {
        onSome: (w) => [w],
        onNone: () => Array.range(1, 13),
      });

      const quarterUrls = yield* findQuarterUrls(year, quarter);

      yield* Effect.log(`Found ${quarterUrls.length} Sabbath School lessons available...`);

      const fs = yield* FileSystem.FileSystem;

      const weeksToProcess = yield* Effect.filter(
        weeks,
        (weekNumber) =>
          Effect.gen(function* () {
            if (force) return true;
            const outlinePath = getFilePath(year, quarter, weekNumber);
            const exists = yield* fs.exists(outlinePath);
            return !exists;
          }),
        {
          concurrency: 'unbounded',
        },
      ).pipe(
        Effect.map((weeks) =>
          weeks.map((weekNumber) =>
            Option.fromNullable(quarterUrls.find((urls) => urls.weekNumber === weekNumber)),
          ),
        ),
        Effect.map(Option.reduceCompact([] as WeekUrls[], (acc, week) => [...acc, week])),
      );

      if (weeksToProcess.length === 0) {
        yield* Effect.log('All Sabbath School lessons are already downloaded!');
        return;
      }

      yield* Effect.log(`Found ${weeksToProcess.length} Sabbath School lessons to process...`);

      yield* Stream.fromIterable(weeksToProcess).pipe(
        Stream.mapEffect(
          (urls) =>
            Effect.gen(function* () {
              // Read existing frontmatter to preserve apple_note_id
              const outlinePath = getFilePath(year, quarter, urls.weekNumber);
              const existingAppleNoteId: Option.Option<AppleNoteId> = yield* Effect.gen(
                function* () {
                  const exists = yield* fs.exists(outlinePath);
                  if (!exists) return Option.none<AppleNoteId>();
                  const raw = yield* fs
                    .readFile(outlinePath)
                    .pipe(Effect.map((i) => new TextDecoder().decode(i)));
                  const { frontmatter } = parseFrontmatter(raw);
                  return Option.fromNullable(frontmatter.apple_note_id as AppleNoteId | undefined);
                },
              );

              yield* Effect.log(`Downloading PDFs...`);
              const [lessonPdf, egwPdf] = yield* Effect.all([
                downloadPdf(
                  urls.files.lessonPdf,
                  getPdfPath(year, quarter, urls.weekNumber, 'lesson'),
                ),
                downloadPdf(urls.files.egwPdf, getPdfPath(year, quarter, urls.weekNumber, 'egw')),
              ]);

              let outline = yield* generateOutline(
                { year, quarter, week: urls.weekNumber },
                lessonPdf,
                egwPdf,
              );

              const revision = yield* reviseOutline(
                { year, quarter, week: urls.weekNumber },
                outline,
              );

              outline = Option.match(revision, {
                onSome: (text) => text,
                onNone: () => outline,
              });

              // Preserve apple_note_id from existing file if present
              const frontmatter = new SabbathSchoolFrontmatter({
                created_at: new Date().toISOString(),
                year,
                quarter,
                week: urls.weekNumber,
                apple_note_id: existingAppleNoteId,
              });
              const contentWithFrontmatter = stringifyFrontmatter(
                {
                  created_at: frontmatter.created_at,
                  year: frontmatter.year,
                  quarter: frontmatter.quarter,
                  week: frontmatter.week,
                  ...(Option.isSome(frontmatter.apple_note_id)
                    ? { apple_note_id: frontmatter.apple_note_id.value }
                    : {}),
                },
                outline,
              );

              yield* Effect.log(`Writing outline to disk...`);
              yield* fs.writeFile(
                getFilePath(year, quarter, urls.weekNumber),
                new TextEncoder().encode(contentWithFrontmatter),
              );
              yield* Effect.log(`Outline written to disk`);
            }).pipe(
              Effect.annotateLogs({
                year,
                quarter,
                week: urls.weekNumber,
              }),
            ),
          {
            concurrency: 3,
          },
        ),
        Stream.runDrain,
      );

      yield* Effect.log(`\nDownload complete`);
    }),
).pipe(Command.provide(({ model }) => AI.fromModel(model)));

const reviseQuarter = Command.make(
  'revise',
  { year, quarter, week, model: requiredModel },
  ({ year, quarter, week }) =>
    Effect.gen(function* () {
      const startTime = Date.now();

      yield* Effect.log(
        `Starting outline revision for Q${quarter} ${year}${
          Option.isSome(week) ? ` Week ${week.value}` : ''
        }`,
      );

      const weeks = Option.match(week, {
        onSome: (w) => [w],
        onNone: () => Array.range(1, 13),
      });

      const fs = yield* FileSystem.FileSystem;

      const weeksToRevise = yield* Effect.filter(weeks, (weekNumber) =>
        Effect.gen(function* () {
          const outlinePath = getFilePath(year, quarter, weekNumber);
          const exists = yield* fs.exists(outlinePath);
          return exists;
        }),
      );

      if (weeksToRevise.length === 0) {
        yield* Effect.log('No Sabbath School lessons to revise');
        return;
      }

      yield* Effect.forEach(
        weeksToRevise,
        (weekNumber, index) =>
          Effect.gen(function* () {
            const outlinePath = getFilePath(year, quarter, weekNumber);
            const rawContent = yield* fs
              .readFile(outlinePath)
              .pipe(Effect.map((i) => new TextDecoder().decode(i)));

            const { frontmatter, content: outlineText } = parseFrontmatter(rawContent);

            const revisedOutline = yield* reviseOutline(
              { year, quarter, week: weekNumber },
              outlineText,
            );

            yield* Option.match(revisedOutline, {
              onSome: (text) =>
                Effect.gen(function* () {
                  // Preserve frontmatter with revised content
                  const finalContent =
                    Object.keys(frontmatter).length > 0
                      ? stringifyFrontmatter(frontmatter, text)
                      : text;
                  yield* fs.writeFile(outlinePath, new TextEncoder().encode(finalContent));
                  yield* Effect.log(`Outline for week ${weekNumber} revised`);
                }),
              onNone: () => Effect.log(`No revision needed for week ${weekNumber}`),
            });
          }).pipe(
            Effect.annotateLogs({
              year,
              quarter,
              week: weekNumber,
              total: weeks.length,
              current: index + 1,
            }),
          ),
        { concurrency: 3 },
      );

      const totalTime = msToMinutes(Date.now() - startTime);
      yield* Effect.log(`\nRevision complete (${totalTime})`);
    }),
).pipe(Command.provide(({ model }) => AI.fromModel(model)));

const exportQuarter = Command.make('export', { year, quarter, week }, ({ year, quarter, week }) =>
  Effect.gen(function* () {
    yield* Effect.log(
      `Starting outline export for Q${quarter} ${year}${
        Option.isSome(week) ? ` Week ${week.value}` : ''
      }`,
    );

    const weeks = Option.match(week, {
      onSome: (w) => [w],
      onNone: () => Array.range(1, 13),
    });

    const fs = yield* FileSystem.FileSystem;

    const weeksToExport = yield* Effect.filter(weeks, (weekNumber) =>
      Effect.gen(function* () {
        const outlinePath = getFilePath(year, quarter, weekNumber);
        const exists = yield* fs.exists(outlinePath);
        return exists;
      }),
    );

    if (weeksToExport.length === 0) {
      yield* Effect.log('No Sabbath School lessons to export');
      return;
    }

    yield* Effect.forEach(weeksToExport, (weekNumber, index) =>
      Effect.gen(function* () {
        const outlinePath = getFilePath(year, quarter, weekNumber);
        const rawContent = yield* fs
          .readFile(outlinePath)
          .pipe(Effect.map((i) => new TextDecoder().decode(i)));

        const { frontmatter, content: outlineText } = parseFrontmatter(rawContent);

        // Skip if already exported
        if (frontmatter.apple_note_id !== undefined) {
          yield* Effect.log(`Skipped (already exported): week ${weekNumber}`);
          return;
        }

        yield* Effect.log(`Exporting outline to Apple Notes...`);
        const { noteId } = yield* makeAppleNoteFromMarkdown(outlineText, {
          activateNotesApp: false,
          folder: 'sabbath school',
        });

        // Update frontmatter with apple_note_id
        const updatedContent = updateFrontmatter(rawContent, { apple_note_id: noteId });
        yield* fs.writeFile(outlinePath, new TextEncoder().encode(updatedContent));

        yield* Effect.log(`Outline exported to Apple Notes -> ${noteId}`);
      }).pipe(
        Effect.annotateLogs({
          year,
          quarter,
          week: weekNumber,
          total: weeks.length,
          current: index + 1,
        }),
      ),
    );
  }),
);

export const sabbathSchool = Command.make('sabbath-school').pipe(
  Command.withSubcommands([
    processQuarter,
    reviseQuarter,
    exportQuarter,
    makeSyncCommand(SabbathSchoolConfig),
    makeDeleteCommand(SabbathSchoolConfig),
  ]),
);
