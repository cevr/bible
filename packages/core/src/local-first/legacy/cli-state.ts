import { Option, Schema } from 'effect';

import { getBibleBook } from '../../bible/canon.js';
import { ChapterNumber, VerseNumber } from '../../bible/model.js';
import { LibraryEntityId, ReaderLocation } from '../../library-state/model.js';
import {
  DEFAULT_READING_PREFERENCES,
  ReadingPreferences,
} from '../../reading-preferences/model.js';
import type { DomainMutationCommand, Timestamp } from '../model.js';
import type { MigrationDiagnostic, MigrationDiagnosticId } from '../legacy-migration.js';

const PositionRow = Schema.Struct({ book: Schema.Int, chapter: Schema.Int, verse: Schema.Int });
const PreferencesRow = Schema.Struct({
  theme: Schema.optionalKey(Schema.Unknown),
  display_mode: Schema.optionalKey(Schema.Unknown),
});
const LegacyEgwPosition = Schema.Struct({
  book_code: Schema.NonEmptyString,
  page: Schema.NullOr(Schema.Int),
  paragraph: Schema.NullOr(Schema.Int),
  puborder: Schema.NullOr(Schema.Int),
});
const UserCrossReferenceRow = Schema.Struct({
  id: Schema.NonEmptyString,
  source_book: Schema.Int,
  source_chapter: Schema.Int,
  source_verse: Schema.Int,
  ref_book: Schema.Int,
  ref_chapter: Schema.Int,
  ref_verse: Schema.NullOr(Schema.Int),
  ref_verse_end: Schema.NullOr(Schema.Int),
  type: Schema.NullOr(Schema.String),
  note: Schema.NullOr(Schema.String),
  created_at: Schema.Int,
});

export type LegacyCliEgwPosition = typeof LegacyEgwPosition.Type;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export interface CliStateProjection {
  readonly commands: ReadonlyArray<DomainMutationCommand>;
  readonly diagnostics: ReadonlyArray<MigrationDiagnostic>;
}

export interface CliStateProjectionOptions {
  readonly nextDiagnosticId: (path: string) => MigrationDiagnosticId;
  readonly nextHistoryId: (path: string) => typeof LibraryEntityId.Type;
  readonly timestampFor: (path: string, legacyEpochMilliseconds?: number) => Timestamp;
  readonly resolveEgwLocation: (
    position: LegacyCliEgwPosition,
  ) => typeof ReaderLocation.Type | undefined;
}

export const projectCliState = (
  input: unknown,
  options: CliStateProjectionOptions,
): CliStateProjection => {
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
    diagnostic('$', 'malformed', 'CLI state snapshot must decode to an object');
    return { commands, diagnostics };
  }

  const rowsFor = (table: string): ReadonlyArray<unknown> => {
    if (!(table in input)) return [];
    const rows = input[table];
    if (Array.isArray(rows)) return rows;
    diagnostic(table, 'malformed', 'legacy table snapshot must decode to an array');
    return [];
  };

  const decodeRows = <A>(
    table: string,
    schema: Schema.ConstraintDecoder<A>,
    visit: (row: A, path: string) => void,
  ): void => {
    for (const [index, candidate] of rowsFor(table).entries()) {
      const path = `${table}[${String(index)}]`;
      const decoded = Schema.decodeUnknownOption(schema)(candidate);
      if (Option.isSome(decoded)) {
        visit(decoded.value, path);
        continue;
      }
      diagnostic(path, 'malformed', 'ignored malformed legacy table row');
    }
  };

  const bibleLocation = (
    path: string,
    book: number,
    chapter: number,
    verse: number | null,
  ): typeof ReaderLocation.Type | undefined => {
    const canonicalBook = getBibleBook(book);
    const canonicalChapter = Schema.decodeUnknownOption(ChapterNumber)(chapter);
    if (
      canonicalBook === undefined ||
      Option.isNone(canonicalChapter) ||
      chapter > canonicalBook.chapters
    ) {
      diagnostic(path, 'out-of-range', 'legacy Bible coordinate is outside the canonical range');
      return undefined;
    }
    let location = `/bible/${String(book)}/${String(chapter)}`;
    if (verse !== null) {
      const canonicalVerse = Schema.decodeUnknownOption(VerseNumber)(verse);
      if (Option.isNone(canonicalVerse)) {
        diagnostic(path, 'out-of-range', 'legacy Bible coordinate is outside the canonical range');
        return undefined;
      }
      location = `${location}/${String(verse)}`;
    }
    return { source: 'bible', resourceId: 'KJV', location };
  };

  decodeRows('position', PositionRow, (row, path) => {
    const location = bibleLocation(path, row.book, row.chapter, row.verse);
    if (location === undefined) return;
    commands.push({
      _tag: 'RecordReading',
      historyId: options.nextHistoryId(path),
      location,
      progress: 0,
      readAt: options.timestampFor(path),
    });
  });

  decodeRows('preferences', PreferencesRow, (row, path) => {
    const field = <A>(
      key: keyof typeof row,
      schema: Schema.ConstraintDecoder<A>,
      fallback: A,
    ): A => {
      const value = row[key];
      if (value === undefined) return fallback;
      const decoded = Schema.decodeUnknownOption(schema)(value);
      if (Option.isSome(decoded)) return decoded.value;
      diagnostic(`${path}.${key}`, 'malformed', 'ignored invalid legacy preference field');
      return fallback;
    };
    const preferences = new ReadingPreferences({
      colorMode: field(
        'theme',
        Schema.Literals(['system', 'light', 'sepia', 'dark']),
        DEFAULT_READING_PREFERENCES.colorMode,
      ),
      readerTypeface: DEFAULT_READING_PREFERENCES.readerTypeface,
      fontSizePx: DEFAULT_READING_PREFERENCES.fontSizePx,
      lineHeightRatio: DEFAULT_READING_PREFERENCES.lineHeightRatio,
      letterSpacingEm: DEFAULT_READING_PREFERENCES.letterSpacingEm,
      measureCh: DEFAULT_READING_PREFERENCES.measureCh,
      bibleLayout: field(
        'display_mode',
        Schema.Literals(['verse', 'paragraph']),
        DEFAULT_READING_PREFERENCES.bibleLayout,
      ),
      showStrongs: DEFAULT_READING_PREFERENCES.showStrongs,
      showMarginNotes: DEFAULT_READING_PREFERENCES.showMarginNotes,
      showCrossReferences: DEFAULT_READING_PREFERENCES.showCrossReferences,
    });
    commands.push({ _tag: 'SetReadingPreferences', preferences });
  });

  decodeRows('egw_position', LegacyEgwPosition, (row, path) => {
    const location = options.resolveEgwLocation(row);
    if (location === undefined) {
      diagnostic(path, 'quarantined', 'legacy writings position could not be resolved exactly');
      return;
    }
    const canonicalLocation = Schema.decodeUnknownOption(ReaderLocation)(location);
    if (Option.isNone(canonicalLocation) || canonicalLocation.value.source !== 'egw') {
      diagnostic(path, 'malformed', 'legacy writings resolver returned an invalid location');
      return;
    }
    commands.push({
      _tag: 'RecordReading',
      historyId: options.nextHistoryId(path),
      location: canonicalLocation.value,
      progress: 0,
      readAt: options.timestampFor(path),
    });
  });

  decodeRows('user_cross_refs', UserCrossReferenceRow, (row, path) => {
    const from = bibleLocation(
      `${path}.source`,
      row.source_book,
      row.source_chapter,
      row.source_verse,
    );
    const to = bibleLocation(`${path}.ref`, row.ref_book, row.ref_chapter, row.ref_verse);
    if (from === undefined || to === undefined) return;
    const id = Schema.decodeUnknownOption(LibraryEntityId)(row.id);
    if (Option.isNone(id)) {
      diagnostic(`${path}.id`, 'malformed', 'legacy cross-reference ID is invalid');
      return;
    }
    let toEnd: typeof ReaderLocation.Type | null = null;
    if (row.ref_verse_end !== null) {
      if (row.ref_verse_end !== row.ref_verse) {
        const resolvedEnd = bibleLocation(
          `${path}.ref_verse_end`,
          row.ref_book,
          row.ref_chapter,
          row.ref_verse_end,
        );
        if (resolvedEnd === undefined) return;
        toEnd = resolvedEnd;
      }
    }
    commands.push({
      _tag: 'SaveUserCrossReference',
      id: id.value,
      from,
      to,
      toEnd,
      kind: row.type,
      note: row.note,
    });
  });

  const discardCount = (table: string, label: string): void => {
    const count = rowsFor(table).length;
    if (count === 0) return;
    diagnostic(table, 'discarded', `discarded ${String(count)} ${label} rows`);
  };

  discardCount('cross_ref_classifications', 'unattributed classification');
  discardCount('ai_search_cache', 'derived AI cache');
  discardCount('terminal_palette', 'device palette');

  return { commands, diagnostics };
};
