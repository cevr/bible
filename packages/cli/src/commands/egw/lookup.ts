import {
  formatEGWRef,
  isSearchQuery,
  nodesToText,
  parseEGWRef,
  type EGWParsedRef,
  type EGWSearchQuery,
} from '@bible/core/egw';
import { Reference } from '@bible/core/writings';
import { WritingsService } from '@bible/core/writings/service';
import { Console, Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { CliProcess } from '../../services/process.js';
import { encodeJson, publicationJson } from './format.js';
import { ServiceLayer } from './layers.js';

type LookupReference = Exclude<EGWParsedRef, EGWSearchQuery>;

export const lookupReference = (parsed: LookupReference) =>
  Effect.gen(function* () {
    const service = yield* WritingsService;
    const refStr = formatEGWRef(parsed);

    const book = yield* service.publicationByCode(parsed.bookCode).pipe(
      Effect.map(Option.some),
      Effect.catchTag('WritingsPublicationNotFoundError', () => Effect.succeed(Option.none())),
    );
    if (Option.isNone(book)) {
      yield* Console.log(`Book "${parsed.bookCode}" not found in local database.`);
      yield* Console.log(`Try \`bible egw download ${parsed.bookCode}\` to fetch it from the API.`);
      return;
    }

    switch (parsed._tag) {
      case 'paragraph':
      case 'paragraph-range':
      case 'page': {
        const page = parsed.page;
        const pageResponse = yield* service
          .page(Reference.page(book.value.id, page))
          .pipe(Effect.catchTag('WritingsPageNotFoundError', () => Effect.succeed(null)));
        if (pageResponse === null) {
          yield* Console.log(`Page ${page} not found in ${book.value.title} (${parsed.bookCode}).`);
          return;
        }

        yield* Console.log(`${book.value.title} (${parsed.bookCode}) — Page ${page}\n`);
        if (Option.isSome(pageResponse.heading)) {
          yield* Console.log(`  ${pageResponse.heading.value}\n`);
        }

        let paragraphs: ReadonlyArray<(typeof pageResponse.paragraphs)[number]> =
          pageResponse.paragraphs;
        if (parsed._tag === 'paragraph') {
          paragraphs = pageResponse.paragraphs.filter(
            (paragraph) => Option.getOrUndefined(paragraph.number) === parsed.paragraph,
          );
        }
        if (parsed._tag === 'paragraph-range') {
          paragraphs = pageResponse.paragraphs.filter((paragraph) =>
            Option.exists(
              paragraph.number,
              (number) => number >= parsed.paragraphStart && number <= parsed.paragraphEnd,
            ),
          );
        }

        if (paragraphs.length === 0) {
          yield* Console.log(`No paragraphs found for ${refStr}.`);
          return;
        }

        for (const paragraph of paragraphs) {
          const ref = Option.getOrElse(paragraph.refcode, () => '');
          yield* Console.log(`  ${ref}`);
          yield* Console.log(`  ${nodesToText(paragraph.nodes)}\n`);
        }
        break;
      }
      case 'page-range': {
        yield* Console.log(
          `${book.value.title} (${parsed.bookCode}) — Pages ${parsed.pageStart}-${parsed.pageEnd}\n`,
        );
        for (let page = parsed.pageStart; page <= parsed.pageEnd; page++) {
          const pageResponse = yield* service
            .page(Reference.page(book.value.id, page))
            .pipe(Effect.catchTag('WritingsPageNotFoundError', () => Effect.succeed(null)));
          if (pageResponse === null) continue;

          for (const paragraph of pageResponse.paragraphs) {
            const ref = Option.getOrElse(paragraph.refcode, () => '');
            yield* Console.log(`  ${ref}`);
            yield* Console.log(`  ${nodesToText(paragraph.nodes)}\n`);
          }
        }
        break;
      }
      case 'book': {
        yield* Console.log(`${book.value.title} (${parsed.bookCode}) — ${book.value.author}`);
        yield* Console.log(
          `Paragraphs: ${Option.getOrElse(book.value.paragraphCount, () => 'unknown' as const)}`,
        );

        const chapters = yield* service.headings(Reference.publication(book.value.id));
        if (chapters.length > 0) {
          yield* Console.log('\nTable of Contents:');
          for (const chapter of chapters) {
            const ref = Option.getOrElse(chapter.refcode, () => '');
            yield* Console.log(`  ${ref}  ${chapter.title}`);
          }
        }
        break;
      }
    }
  });

const collectLookupData = (parsed: LookupReference) =>
  Effect.gen(function* () {
    const service = yield* WritingsService;
    const refStr = formatEGWRef(parsed);

    const book = yield* service.publicationByCode(parsed.bookCode).pipe(
      Effect.map(Option.some),
      Effect.catchTag('WritingsPublicationNotFoundError', () => Effect.succeed(Option.none())),
    );
    if (Option.isNone(book)) {
      return { ref: refStr, found: false as const, bookCode: parsed.bookCode };
    }

    switch (parsed._tag) {
      case 'paragraph':
      case 'paragraph-range':
      case 'page': {
        const pageResponse = yield* service
          .page(Reference.page(book.value.id, parsed.page))
          .pipe(Effect.catchTag('WritingsPageNotFoundError', () => Effect.succeed(null)));
        if (pageResponse === null) {
          return {
            ref: refStr,
            found: false as const,
            book: publicationJson(book.value),
            page: parsed.page,
          };
        }

        let paragraphs: ReadonlyArray<(typeof pageResponse.paragraphs)[number]> =
          pageResponse.paragraphs;
        if (parsed._tag === 'paragraph') {
          paragraphs = pageResponse.paragraphs.filter(
            (paragraph) => Option.getOrUndefined(paragraph.number) === parsed.paragraph,
          );
        }
        if (parsed._tag === 'paragraph-range') {
          paragraphs = pageResponse.paragraphs.filter((paragraph) =>
            Option.exists(
              paragraph.number,
              (number) => number >= parsed.paragraphStart && number <= parsed.paragraphEnd,
            ),
          );
        }

        return {
          ref: refStr,
          found: true as const,
          kind: 'page' as const,
          book: publicationJson(book.value),
          page: parsed.page,
          chapterHeading: Option.getOrNull(pageResponse.heading),
          paragraphs: paragraphs.map((paragraph) => ({
            refcode: Option.getOrElse(paragraph.refcode, () => ''),
            text: nodesToText(paragraph.nodes),
          })),
        };
      }
      case 'page-range': {
        const pages: Array<{
          page: number;
          chapterHeading: string | null;
          paragraphs: Array<{ refcode: string; text: string }>;
        }> = [];
        for (let page = parsed.pageStart; page <= parsed.pageEnd; page++) {
          const pageResponse = yield* service
            .page(Reference.page(book.value.id, page))
            .pipe(Effect.catchTag('WritingsPageNotFoundError', () => Effect.succeed(null)));
          if (pageResponse === null) continue;
          pages.push({
            page,
            chapterHeading: Option.getOrNull(pageResponse.heading),
            paragraphs: pageResponse.paragraphs.map((paragraph) => ({
              refcode: Option.getOrElse(paragraph.refcode, () => ''),
              text: nodesToText(paragraph.nodes),
            })),
          });
        }
        return {
          ref: refStr,
          found: true as const,
          kind: 'page-range' as const,
          book: publicationJson(book.value),
          pageStart: parsed.pageStart,
          pageEnd: parsed.pageEnd,
          pages,
        };
      }
      case 'book': {
        const chapters = yield* service.headings(Reference.publication(book.value.id));
        return {
          ref: refStr,
          found: true as const,
          kind: 'book' as const,
          book: publicationJson(book.value),
          chapters: chapters.map((chapter) => ({
            refcode: Option.getOrElse(chapter.refcode, () => ''),
            title: chapter.title,
          })),
        };
      }
    }
  });

const ref = Argument.string('ref').pipe(Argument.variadic());
const json = Flag.boolean('json').pipe(
  Flag.withDescription('Output JSON instead of formatted text'),
  Flag.withDefault(false),
);

export const egwLookup = Command.make('lookup', { ref, json }, (args) =>
  Effect.gen(function* () {
    const refStr = args.ref.join(' ').trim();
    if (refStr.length === 0) {
      yield* Console.log('Usage: bible egw lookup <refcode> [--json]');
      yield* Console.log('');
      yield* Console.log('Examples:');
      yield* Console.log('  bible egw lookup "PP 351.1"     # Single paragraph');
      yield* Console.log('  bible egw lookup "PP 351"       # Full page');
      yield* Console.log('  bible egw lookup "PP 351-355"   # Page range');
      yield* Console.log('  bible egw lookup "PP"           # Book info + TOC');
      return;
    }

    const parsed = parseEGWRef(refStr);
    if (isSearchQuery(parsed)) {
      yield* Console.error(`Not a valid EGW refcode: "${refStr}"`);
      yield* Console.error('Use `bible egw search <query>` for FTS instead.');
      const cliProcess = yield* CliProcess;
      return yield* cliProcess.exitFailure;
    }

    if (args.json) {
      yield* Console.log(yield* encodeJson(yield* collectLookupData(parsed)));
      return;
    }

    yield* lookupReference(parsed);
  }),
).pipe(Command.provide(() => ServiceLayer));
