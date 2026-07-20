import { Command, Flag } from 'effect/unstable/cli';
import { HttpClient, HttpClientResponse } from 'effect/unstable/http';
import {
  Array,
  Console,
  Data,
  DateTime,
  Effect,
  FileSystem,
  Option,
  Path,
  Schema,
  SchemaGetter,
} from 'effect';
import * as cheerio from 'cheerio';

import { makeDeleteCommand, makeSyncCommand } from '~/src/lib/content/commands';
import { SabbathSchoolConfig } from '~/src/lib/content/configs';
import { parseFrontmatter, updateFrontmatter } from '~/src/lib/frontmatter';
import { makeAppleNoteFromMarkdown } from '~/src/lib/markdown-to-notes';
import { getOutputsPath } from '~/src/lib/paths';

const currentDate = DateTime.toParts(DateTime.nowUnsafe());
const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);
const encodeJson = Schema.encodeUnknownEffect(JsonString);

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

const year = Flag.integer('year').pipe(
  Flag.withAlias('y'),
  Flag.withSchema(Schema.Number.check(Schema.isLessThanOrEqualTo(currentDate.year))),
  Flag.optional,
  Flag.map(Option.getOrElse(() => currentDate.year)),
);
const quarter = Flag.integer('quarter').pipe(
  Flag.withAlias('q'),
  Flag.withSchema(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(4)),
  ),
  Flag.optional,
  Flag.map(Option.getOrElse(() => Math.floor((currentDate.month - 1) / 3) + 1)),
);

const week = Flag.integer('week').pipe(
  Flag.withAlias('w'),
  Flag.withSchema(
    Schema.Number.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(13)),
  ),
  Flag.optional,
);

interface WeekFiles {
  lessonPdf: string;
  egwPdf: string;
}

interface WeekUrls {
  weekNumber: number;
  files: WeekFiles;
}

const findQuarterUrls = Effect.fn('findQuarterUrls')(function* (year: number, quarter: number) {
  const baseUrl = `https://www.sabbath.school/LessonBook?year=${year}&quarter=${quarter}`;
  const response = yield* HttpClient.get(baseUrl).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap((result) => result.text),
    Effect.mapError((cause) => new DownloadError({ week: 0, cause })),
  );

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

  $('a.btn-u.btn-u-sm').each((_, element) => {
    const text = $(element).text().trim();
    const href = $(element).attr('href');

    if (href === undefined) return;

    if (text === 'Teachers PDF') {
      currentFiles.lessonPdf = href;
    } else if (text === 'EGW Notes PDF') {
      currentFiles.egwPdf = href;
    }

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

  if (weekUrls.length === 0) {
    return yield* new MissingPdfError({
      quarter,
    });
  }

  return weekUrls;
});

const downloadPdf = Effect.fn('downloadPdf')(function* (url: string, cachePath: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const exists = yield* fs.exists(cachePath);
  if (exists) {
    const bytes = yield* fs.readFile(cachePath);
    return bytes.buffer as ArrayBuffer;
  }

  const buffer = yield* HttpClient.get(url).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap((result) => result.arrayBuffer),
    Effect.mapError((cause) => new DownloadError({ week: 0, cause })),
  );

  yield* fs.makeDirectory(path.dirname(cachePath), { recursive: true });
  yield* fs.writeFile(cachePath, new Uint8Array(buffer));

  return buffer;
});

const getFilePath = Effect.fn('getFilePath')(function* (
  year: number,
  quarter: number,
  week: number,
) {
  const path = yield* Path.Path;
  const outputDir = getOutputsPath('sabbath-school');
  return path.join(outputDir, `${year}-Q${quarter}-W${week}.md`);
});

const getPdfPath = Effect.fn('getPdfPath')(function* (
  year: number,
  quarter: number,
  week: number,
  type: 'lesson' | 'egw',
) {
  const path = yield* Path.Path;
  const pdfDir = getOutputsPath('sabbath-school', 'pdfs');
  return path.join(pdfDir, `${year}-Q${quarter}-W${week}-${type}.pdf`);
});

const fetchJson = Flag.boolean('json').pipe(
  Flag.withDescription('Output JSON with paths and metadata instead of human-readable status'),
  Flag.withDefault(false),
);

const fetchQuarter = Command.make('fetch', { year, quarter, week, json: fetchJson }, (args) =>
  Effect.gen(function* () {
    if (!args.json) {
      const weekDescription = Option.match(args.week, {
        onSome: (selectedWeek) => ` Week ${selectedWeek}`,
        onNone: () => '',
      });
      yield* Effect.log(`Fetching PDFs for Q${args.quarter} ${args.year}${weekDescription}`);
    }

    const weeks = Option.match(args.week, {
      onSome: (w) => [w],
      onNone: () => Array.range(1, 13),
    });

    const quarterUrls = yield* findQuarterUrls(args.year, args.quarter);

    const requested = weeks
      .map((weekNumber) => quarterUrls.find((u) => u.weekNumber === weekNumber))
      .filter((u): u is WeekUrls => u !== undefined);

    const downloaded: Array<{
      year: number;
      quarter: number;
      week: number;
      lessonPdf: string;
      egwPdf: string;
      lessonUrl: string;
      egwUrl: string;
    }> = [];

    yield* Effect.forEach(
      requested,
      (urls) =>
        Effect.gen(function* () {
          const lessonPath = yield* getPdfPath(args.year, args.quarter, urls.weekNumber, 'lesson');
          const egwPath = yield* getPdfPath(args.year, args.quarter, urls.weekNumber, 'egw');
          yield* downloadPdf(urls.files.lessonPdf, lessonPath);
          yield* downloadPdf(urls.files.egwPdf, egwPath);
          downloaded.push({
            year: args.year,
            quarter: args.quarter,
            week: urls.weekNumber,
            lessonPdf: lessonPath,
            egwPdf: egwPath,
            lessonUrl: urls.files.lessonPdf,
            egwUrl: urls.files.egwPdf,
          });
          if (!args.json) {
            yield* Effect.log(`  Week ${urls.weekNumber}: ${lessonPath}, ${egwPath}`);
          }
        }),
      { concurrency: 3 },
    );

    if (args.json) {
      yield* Console.log(yield* encodeJson({ weeks: downloaded }));
    } else {
      yield* Effect.log(`Done — ${downloaded.length} week(s) fetched`);
    }
  }),
);

const exportQuarter = Command.make('export', { year, quarter, week }, ({ year, quarter, week }) =>
  Effect.gen(function* () {
    const weekDescription = Option.match(week, {
      onSome: (selectedWeek) => ` Week ${selectedWeek}`,
      onNone: () => '',
    });
    yield* Effect.log(`Starting outline export for Q${quarter} ${year}${weekDescription}`);

    const weeks = Option.match(week, {
      onSome: (w) => [w],
      onNone: () => Array.range(1, 13),
    });

    const fs = yield* FileSystem.FileSystem;

    const weeksToExport = yield* Effect.filter(weeks, (weekNumber) =>
      Effect.gen(function* () {
        const outlinePath = yield* getFilePath(year, quarter, weekNumber);
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
        const outlinePath = yield* getFilePath(year, quarter, weekNumber);
        const rawContent = yield* fs
          .readFile(outlinePath)
          .pipe(Effect.map((i) => new TextDecoder().decode(i)));

        const { frontmatter, content: outlineText } = parseFrontmatter(rawContent);

        if (frontmatter['apple_note_id'] !== undefined) {
          yield* Effect.log(`Skipped (already exported): week ${weekNumber}`);
          return;
        }

        yield* Effect.log(`Exporting outline to Apple Notes...`);
        const { noteId } = yield* makeAppleNoteFromMarkdown(outlineText, {
          activateNotesApp: false,
          folder: 'sabbath school',
        });

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
    fetchQuarter,
    exportQuarter,
    makeSyncCommand(SabbathSchoolConfig),
    makeDeleteCommand(SabbathSchoolConfig),
  ]),
);
