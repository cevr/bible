import { Option, Predicate, Schema } from 'effect';

import { getBibleBook } from '../../bible/canon.js';
import { BookNumber, ChapterNumber, VerseNumber } from '../../bible/model.js';
import { ReaderLocation, type LibraryEntityId } from '../../library-state/model.js';
import type { DomainMutationCommand, Timestamp } from '../model.js';
import type { MigrationDiagnostic, MigrationDiagnosticId } from '../legacy-migration.js';

const LegacyEgwPosition = Schema.Struct({
  book_id: Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))),
  para_id: Schema.NullOr(Schema.String),
  paragraph_id: Schema.NullOr(Schema.String),
});

export type LegacyDesktopEgwPosition = typeof LegacyEgwPosition.Type;

const replaceableCacheTables = ['book_lists', 'tocs', 'chapters', 'folders', 'folder_books'];

export interface DesktopCacheProjection {
  readonly commands: ReadonlyArray<DomainMutationCommand>;
  readonly diagnostics: ReadonlyArray<MigrationDiagnostic>;
}

export interface DesktopCacheProjectionOptions {
  readonly nextDiagnosticId: (path: string) => MigrationDiagnosticId;
  readonly nextHistoryId: (path: string) => LibraryEntityId;
  readonly timestampFor: (path: string) => Timestamp;
  readonly resolveEgwLocation: (
    position: LegacyDesktopEgwPosition,
  ) => Option.Option<ReaderLocation>;
}

/** The three raw coordinates of a legacy Bible position row, not yet decoded. */
interface LegacyBibleRow {
  readonly book: unknown;
  readonly chapter: unknown;
  readonly verse: unknown;
}

type Diagnose = (path: string, category: MigrationDiagnostic['category'], message: string) => void;

type ReadingLocation = Extract<DomainMutationCommand, { _tag: 'RecordReading' }>['location'];

const recordReading = (
  options: DesktopCacheProjectionOptions,
  path: string,
  location: ReadingLocation,
): DomainMutationCommand => ({
  _tag: 'RecordReading',
  historyId: options.nextHistoryId(path),
  location,
  progress: 0,
  readAt: options.timestampFor(path),
});

/** Decode `row[field]` as a number, then as the given coordinate, reporting
 *  which of the two steps failed at `path.field`. */
const decodeCoordinate = <A>(
  row: LegacyBibleRow,
  field: keyof LegacyBibleRow,
  schema: Schema.ConstraintDecoder<A>,
  path: string,
  diagnostic: Diagnose,
): Option.Option<A> => {
  const fieldPath = `${path}.${field}`;
  const number = Schema.decodeUnknownOption(Schema.Finite)(row[field]);
  if (Option.isNone(number)) {
    diagnostic(fieldPath, 'malformed', 'legacy Bible coordinate must decode to a number');
    return Option.none();
  }
  const decoded = Schema.decodeOption(schema)(number.value);
  if (Option.isSome(decoded)) return decoded;
  diagnostic(fieldPath, 'out-of-range', 'legacy Bible coordinate is outside the canonical range');
  return Option.none();
};

/** A `null` verse is a chapter-level position (some none); anything else must
 *  decode as a verse number, and none means it did not. */
const decodeVerse = (
  row: LegacyBibleRow,
  path: string,
  diagnostic: Diagnose,
): Option.Option<Option.Option<VerseNumber>> => {
  if (Predicate.isNull(row.verse)) return Option.some(Option.none());
  return Option.map(decodeCoordinate(row, 'verse', VerseNumber, path, diagnostic), Option.some);
};

/** The reader path for one legacy Bible position, when every coordinate
 *  decodes and the chapter exists in its book. */
const bibleLocation = (
  row: LegacyBibleRow,
  path: string,
  diagnostic: Diagnose,
): Option.Option<string> => {
  const book = decodeCoordinate(row, 'book', BookNumber, path, diagnostic);
  const chapter = decodeCoordinate(row, 'chapter', ChapterNumber, path, diagnostic);
  const verse = decodeVerse(row, path, diagnostic);
  if (Option.isNone(book) || Option.isNone(chapter) || Option.isNone(verse)) return Option.none();
  const canonicalBook = getBibleBook(book.value);
  if (Option.isNone(canonicalBook) || chapter.value > canonicalBook.value.chapters) {
    diagnostic(
      `${path}.chapter`,
      'out-of-range',
      'legacy Bible chapter is outside the canonical book range',
    );
    return Option.none();
  }
  let location = `/bible/${String(book.value)}/${String(chapter.value)}`;
  const verseNumber = verse.value;
  if (Option.isSome(verseNumber)) location = `${location}/${String(verseNumber.value)}`;
  return Option.some(location);
};

/** The canonical writings location for one decoded legacy position, when the
 *  resolver places it exactly. */
const egwLocation = (
  decoded: Option.Option<LegacyDesktopEgwPosition>,
  path: string,
  options: DesktopCacheProjectionOptions,
  diagnostic: Diagnose,
): Option.Option<ReaderLocation> => {
  if (Option.isNone(decoded)) {
    diagnostic(path, 'malformed', 'legacy writings position must decode to its stored shape');
    return Option.none();
  }
  const location = options.resolveEgwLocation(decoded.value);
  if (Option.isNone(location)) {
    diagnostic(path, 'quarantined', 'legacy writings position could not be resolved exactly');
    return Option.none();
  }
  const canonicalLocation = Schema.decodeOption(ReaderLocation)(location.value);
  if (Option.isNone(canonicalLocation) || canonicalLocation.value.source !== 'egw') {
    diagnostic(path, 'malformed', 'legacy writings resolver returned an invalid location');
    return Option.none();
  }
  return canonicalLocation;
};

export const projectDesktopCache = (
  // oxlint-disable-next-line effect/noUnknownParameters -- legacy snapshot I/O boundary: raw JSON is decoded field-by-field with schemas below
  input: unknown,
  options: DesktopCacheProjectionOptions,
): DesktopCacheProjection => {
  const commands: Array<DomainMutationCommand> = [];
  const diagnostics: Array<MigrationDiagnostic> = [];
  const diagnostic: Diagnose = (path, category, message) => {
    diagnostics.push({ id: options.nextDiagnosticId(path), path, category, message });
  };

  if (!Predicate.isObject(input)) {
    diagnostic('$', 'malformed', 'desktop cache snapshot must decode to an object');
    return { commands, diagnostics };
  }

  const rowsFor = (table: string): ReadonlyArray<unknown> => {
    if (!(table in input)) return [];
    const rows = input[table];
    if (Array.isArray(rows)) return rows;
    diagnostic(table, 'malformed', 'legacy table snapshot must decode to an array');
    return [];
  };

  for (const [index, row] of rowsFor('bible_last_position').entries()) {
    const path = `bible_last_position[${String(index)}]`;
    if (!Predicate.isObject(row)) {
      diagnostic(path, 'malformed', 'legacy Bible position must decode to an object');
      continue;
    }
    const coordinates = { book: row['book'], chapter: row['chapter'], verse: row['verse'] };
    const location = bibleLocation(coordinates, path, diagnostic);
    if (Option.isNone(location)) continue;
    commands.push(
      recordReading(options, path, {
        source: 'bible',
        resourceId: 'KJV',
        location: location.value,
      }),
    );
  }

  for (const [index, row] of rowsFor('last_position').entries()) {
    const path = `last_position[${String(index)}]`;
    const decoded = Schema.decodeUnknownOption(LegacyEgwPosition)(row);
    const location = egwLocation(decoded, path, options, diagnostic);
    if (Option.isSome(location)) commands.push(recordReading(options, path, location.value));
  }

  for (const table of replaceableCacheTables) {
    const count = rowsFor(table).length;
    if (count > 0) {
      diagnostic(table, 'discarded', `discarded ${String(count)} replaceable cache rows`);
    }
  }

  return { commands, diagnostics };
};
