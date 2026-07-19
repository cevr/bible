import { Option, Schema } from 'effect';

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

const replaceableCacheTables = [
  'book_lists',
  'tocs',
  'chapters',
  'folders',
  'folder_books',
] as const;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
  ) => typeof ReaderLocation.Type | undefined;
}

export const projectDesktopCache = (
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

  if (!isRecord(input)) {
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
    value: unknown,
    schema: Schema.ConstraintDecoder<A>,
    path: string,
  ): A | undefined => {
    const number = Schema.decodeUnknownOption(Schema.Number)(value);
    if (Option.isNone(number)) {
      diagnostic(path, 'malformed', 'legacy Bible coordinate must decode to a number');
      return undefined;
    }
    const decoded = Schema.decodeUnknownOption(schema)(number.value);
    if (Option.isSome(decoded)) return decoded.value;
    diagnostic(path, 'out-of-range', 'legacy Bible coordinate is outside the canonical range');
    return undefined;
  };

  for (const [index, row] of rowsFor('bible_last_position').entries()) {
    const path = `bible_last_position[${String(index)}]`;
    if (!isRecord(row)) {
      diagnostic(path, 'malformed', 'legacy Bible position must decode to an object');
      continue;
    }
    const book = decodeCoordinate(row['book'], BookNumber, `${path}.book`);
    const chapter = decodeCoordinate(row['chapter'], ChapterNumber, `${path}.chapter`);
    let verse: typeof VerseNumber.Type | null | undefined;
    if (row['verse'] === null) verse = null;
    else verse = decodeCoordinate(row['verse'], VerseNumber, `${path}.verse`);
    if (book === undefined || chapter === undefined || verse === undefined) continue;
    const canonicalBook = getBibleBook(book);
    if (canonicalBook === undefined || chapter > canonicalBook.chapters) {
      diagnostic(
        `${path}.chapter`,
        'out-of-range',
        'legacy Bible chapter is outside the canonical book range',
      );
      continue;
    }
    let location = `/bible/${String(book)}/${String(chapter)}`;
    if (verse !== null) location = `${location}/${String(verse)}`;
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
    if (location === undefined) {
      diagnostic(path, 'quarantined', 'legacy writings position could not be resolved exactly');
      continue;
    }
    const canonicalLocation = Schema.decodeUnknownOption(ReaderLocation)(location);
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
