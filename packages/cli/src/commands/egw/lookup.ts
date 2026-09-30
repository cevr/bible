import {
  formatEGWRef,
  isSearchQuery,
  nodesToText,
  parseEGWRef,
  type EGWBookRef,
  type EGWPageRangeRef,
  type EGWPageRef,
  type EGWParagraphRangeRef,
  type EGWParagraphRef,
  type EGWParsedRef,
  type EGWSearchQuery,
} from '@bible/core/egw';
import { Reference, type Paragraph, type Publication } from '@bible/core/writings';
import { WritingsService } from '@bible/core/writings/service';
import { Array as Arr, Console, Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';

import { CliProcess } from '../../services/process.js';
import { encodeJson, publicationJson } from './format.js';
import { ServiceLayer } from './layers.js';

type LookupReference = Exclude<EGWParsedRef, EGWSearchQuery>;

type PageLookup = EGWParagraphRef | EGWParagraphRangeRef | EGWPageRef;

/** Narrow a page's paragraphs to the ones a paragraph or paragraph-range ref names. */
const selectParagraphs = (parsed: PageLookup, paragraphs: ReadonlyArray<Paragraph>) => {
  if (parsed._tag === 'paragraph') {
    return paragraphs.filter(
      (paragraph) => Option.getOrUndefined(paragraph.number) === parsed.paragraph,
    );
  }
  if (parsed._tag === 'paragraph-range') {
    return paragraphs.filter((paragraph) =>
      Option.exists(
        paragraph.number,
        (number) => number >= parsed.paragraphStart && number <= parsed.paragraphEnd,
      ),
    );
  }
  return paragraphs;
};

const printParagraphs = (paragraphs: ReadonlyArray<Paragraph>) =>
  Effect.forEach(
    paragraphs,
    (paragraph) =>
      Effect.gen(function* () {
        const ref = Option.getOrElse(paragraph.refcode, () => '');
        yield* Console.log(`  ${ref}`);
        yield* Console.log(`  ${nodesToText(paragraph.nodes)}\n`);
      }),
    { discard: true },
  );

const findPage = (book: Publication, page: number) =>
  Effect.gen(function* () {
    const service = yield* WritingsService;
    return yield* service.page(Reference.page(book.id, page)).pipe(
      Effect.asSome,
      Effect.catchTag('WritingsPageNotFoundError', () => Effect.succeedNone),
    );
  });

const printPage = (book: Publication, parsed: PageLookup) =>
  Effect.gen(function* () {
    const page = parsed.page;
    const maybePage = yield* findPage(book, page);
    if (Option.isNone(maybePage)) {
      yield* Console.log(`Page ${page} not found in ${book.title} (${parsed.bookCode}).`);
      return;
    }
    const pageResponse = maybePage.value;

    yield* Console.log(`${book.title} (${parsed.bookCode}) — Page ${page}\n`);
    if (Option.isSome(pageResponse.heading)) {
      yield* Console.log(`  ${pageResponse.heading.value}\n`);
    }

    const paragraphs = selectParagraphs(parsed, pageResponse.paragraphs);
    if (paragraphs.length === 0) {
      yield* Console.log(`No paragraphs found for ${formatEGWRef(parsed)}.`);
      return;
    }

    yield* printParagraphs(paragraphs);
  });

const printPageRange = (book: Publication, parsed: EGWPageRangeRef) =>
  Effect.gen(function* () {
    yield* Console.log(
      `${book.title} (${parsed.bookCode}) — Pages ${parsed.pageStart}-${parsed.pageEnd}\n`,
    );
    for (let page = parsed.pageStart; page <= parsed.pageEnd; page++) {
      const maybePage = yield* findPage(book, page);
      if (Option.isNone(maybePage)) continue;
      yield* printParagraphs(maybePage.value.paragraphs);
    }
  });

const printBook = (book: Publication, parsed: EGWBookRef) =>
  Effect.gen(function* () {
    const service = yield* WritingsService;
    yield* Console.log(`${book.title} (${parsed.bookCode}) — ${book.author}`);
    yield* Console.log(
      `Paragraphs: ${Option.getOrElse(book.paragraphCount, () => 'unknown' as const)}`,
    );

    const chapters = yield* service.headings(Reference.publication(book.id));
    if (chapters.length > 0) {
      yield* Console.log('\nTable of Contents:');
      for (const chapter of chapters) {
        const ref = Option.getOrElse(chapter.refcode, () => '');
        yield* Console.log(`  ${ref}  ${chapter.title}`);
      }
    }
  });

export const lookupReference = (parsed: LookupReference) =>
  Effect.gen(function* () {
    const service = yield* WritingsService;

    const book = yield* service.publicationByCode(parsed.bookCode).pipe(
      Effect.asSome,
      Effect.catchTag('WritingsPublicationNotFoundError', () => Effect.succeedNone),
    );
    if (Option.isNone(book)) {
      yield* Console.log(`Book "${parsed.bookCode}" not found in local database.`);
      yield* Console.log(`Try \`bible egw download ${parsed.bookCode}\` to fetch it from the API.`);
      return;
    }

    switch (parsed._tag) {
      case 'paragraph':
      case 'paragraph-range':
      case 'page':
        return yield* printPage(book.value, parsed);
      case 'page-range':
        return yield* printPageRange(book.value, parsed);
      case 'book':
        return yield* printBook(book.value, parsed);
    }
  });

const collectLookupData = (parsed: LookupReference) =>
  Effect.gen(function* () {
    const service = yield* WritingsService;
    const refStr = formatEGWRef(parsed);

    const book = yield* service.publicationByCode(parsed.bookCode).pipe(
      Effect.asSome,
      Effect.catchTag('WritingsPublicationNotFoundError', () => Effect.succeedNone),
    );
    if (Option.isNone(book)) {
      return { ref: refStr, found: false as const, bookCode: parsed.bookCode };
    }

    switch (parsed._tag) {
      case 'paragraph':
      case 'paragraph-range':
      case 'page': {
        const maybePage = yield* service.page(Reference.page(book.value.id, parsed.page)).pipe(
          Effect.asSome,
          Effect.catchTag('WritingsPageNotFoundError', () => Effect.succeedNone),
        );
        if (Option.isNone(maybePage)) {
          return {
            ref: refStr,
            found: false as const,
            book: publicationJson(book.value),
            page: parsed.page,
          };
        }
        const pageResponse = maybePage.value;

        const paragraphs = selectParagraphs(parsed, pageResponse.paragraphs);

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
        const pageNumbers = Array.from(
          { length: parsed.pageEnd - parsed.pageStart + 1 },
          (_, index) => parsed.pageStart + index,
        );
        const collected = yield* Effect.forEach(pageNumbers, (page) =>
          service.page(Reference.page(book.value.id, page)).pipe(
            Effect.map((pageResponse) =>
              Option.some({
                page,
                chapterHeading: Option.getOrNull(pageResponse.heading),
                paragraphs: pageResponse.paragraphs.map((paragraph) => ({
                  refcode: Option.getOrElse(paragraph.refcode, () => ''),
                  text: nodesToText(paragraph.nodes),
                })),
              }),
            ),
            Effect.catchTag('WritingsPageNotFoundError', () => Effect.succeedNone),
          ),
        );
        const pages = Arr.getSomes(collected);
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

const ref = Argument.String('ref').pipe(Argument.variadic());
const json = Flag.Boolean('json').pipe(
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
