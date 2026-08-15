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

export const projectDesktopCache = (
  // oxlint-disable-next-line effect/noUnknownParameters -- legacy snapshot I/O boundary: raw JSON is decoded field-by-field with schemas below
  input: unknown,
  options: DesktopCacheProjectionOptions,
): DesktopCacheProjection => {
  const commands: Array<DomainMutationCommand> = [];
  const diagnostics: Array<MigrationDiagnostic> = [];
  const diagnostic = (
    path: string,
    category: MigrationDiagnostic['category'],
    message: string,
  ): void => {
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

  const decodeCoordinate = <A>(
    // oxlint-disable-next-line effect/noUnknownParameters -- value is decoded with the provided schema decoder immediately below
    value: unknown,
    schema: Schema.ConstraintDecoder<A>,
    path: string,
  ): Option.Option<A> => {
    const number = Schema.decodeUnknownOption(Schema.Finite)(value);
    if (Option.isNone(number)) {
      diagnostic(path, 'malformed', 'legacy Bible coordinate must decode to a number');
      return Option.none();
    }
    const decoded = Schema.decodeOption(schema)(number.value);
    if (Option.isSome(decoded)) return decoded;
    diagnostic(path, 'out-of-range', 'legacy Bible coordinate is outside the canonical range');
    return Option.none();
  };

  for (const [index, row] of rowsFor('bible_last_position').entries()) {
    const path = `bible_last_position[${String(index)}]`;
    if (!Predicate.isObject(row)) {
      diagnostic(path, 'malformed', 'legacy Bible position must decode to an object');
      continue;
    }
    const book = decodeCoordinate(row['book'], BookNumber, `${path}.book`);
    const chapter = decodeCoordinate(row['chapter'], ChapterNumber, `${path}.chapter`);
    let verse = Option.none<Option.Option<VerseNumber>>();
    if (Predicate.isNull(row['verse'])) verse = Option.some(Option.none());
    else {
      const decodedVerse = decodeCoordinate(row['verse'], VerseNumber, `${path}.verse`);
      if (Option.isSome(decodedVerse)) verse = Option.some(decodedVerse);
    }
    if (Option.isNone(book) || Option.isNone(chapter) || Option.isNone(verse)) continue;
    const canonicalBook = getBibleBook(book.value);
    if (Option.isNone(canonicalBook) || chapter.value > canonicalBook.value.chapters) {
      diagnostic(
        `${path}.chapter`,
        'out-of-range',
        'legacy Bible chapter is outside the canonical book range',
      );
      continue;
    }
    let location = `/bible/${String(book.value)}/${String(chapter.value)}`;
    const verseNumber = verse.value;
    if (Option.isSome(verseNumber)) location = `${location}/${String(verseNumber.value)}`;
    commands.push({
      _tag: 'RecordReading',
      historyId: options.nextHistoryId(path),
      location: { source: 'bible', resourceId: 'KJV', location },
      progress: 0,
      readAt: options.timestampFor(path),
    });
  }

  for (const [index, row] of rowsFor('last_position').entries()) {
    const path = `last_position[${String(index)}]`;
    const decoded = Schema.decodeUnknownOption(LegacyEgwPosition)(row);
    if (Option.isNone(decoded)) {
      diagnostic(path, 'malformed', 'legacy writings position must decode to its stored shape');
      continue;
    }
    const location = options.resolveEgwLocation(decoded.value);
    if (Option.isNone(location)) {
      diagnostic(path, 'quarantined', 'legacy writings position could not be resolved exactly');
      continue;
    }
    const canonicalLocation = Schema.decodeOption(ReaderLocation)(location.value);
    if (Option.isNone(canonicalLocation) || canonicalLocation.value.source !== 'egw') {
      diagnostic(path, 'malformed', 'legacy writings resolver returned an invalid location');
      continue;
    }
    commands.push({
      _tag: 'RecordReading',
      historyId: options.nextHistoryId(path),
      location: canonicalLocation.value,
      progress: 0,
      readAt: options.timestampFor(path),
    });
  }

  for (const table of replaceableCacheTables) {
    const count = rowsFor(table).length;
    if (count > 0) {
      diagnostic(table, 'discarded', `discarded ${String(count)} replaceable cache rows`);
    }
  }

  return { commands, diagnostics };
};
