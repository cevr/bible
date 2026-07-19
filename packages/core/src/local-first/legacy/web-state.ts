import { Option, Schema } from 'effect';

import { getBibleBook } from '../../bible/canon.js';
import { ChapterNumber, VerseNumber } from '../../bible/model.js';
import { type LibraryEntityId, ReaderLocation } from '../../library-state/model.js';
import {
  DEFAULT_READING_PREFERENCES,
  ReadingPreferences,
  type ReaderTypeface,
} from '../../reading-preferences/model.js';
import type { MigrationDiagnostic, MigrationDiagnosticId } from '../legacy-migration.js';
import { DomainMutationCommand, type Timestamp } from '../model.js';

const rowId = Schema.Union([Schema.String, Schema.Number]);
const nullableString = Schema.NullOr(Schema.String);
const nullableInt = Schema.NullOr(Schema.Int);

const PositionRow = Schema.Struct({
  book: Schema.Int,
  chapter: Schema.Int,
  verse: Schema.Int,
});
const HistoryRow = Schema.Struct({
  id: rowId,
  book: Schema.Int,
  chapter: Schema.Int,
  verse: Schema.NullOr(Schema.Int),
  visited_at: Schema.Int,
});
const BookmarkRow = Schema.Struct({
  id: Schema.NonEmptyString,
  book: Schema.Int,
  chapter: Schema.Int,
  verse: nullableInt,
  note: nullableString,
  created_at: Schema.Int,
});
const PreferencesRow = Schema.Struct({
  theme: Schema.optionalKey(Schema.Unknown),
  display_mode: Schema.optionalKey(Schema.Unknown),
  font_family: Schema.optionalKey(Schema.Unknown),
  font_size: Schema.optionalKey(Schema.Unknown),
  line_height: Schema.optionalKey(Schema.Unknown),
  letter_spacing: Schema.optionalKey(Schema.Unknown),
});
const UserCrossReferenceRow = Schema.Struct({
  id: Schema.NonEmptyString,
  source_book: Schema.Int,
  source_chapter: Schema.Int,
  source_verse: Schema.Int,
  ref_book: Schema.Int,
  ref_chapter: Schema.Int,
  ref_verse: nullableInt,
  ref_verse_end: nullableInt,
  type: nullableString,
  note: nullableString,
  created_at: Schema.Int,
});
const VerseNoteRow = Schema.Struct({
  id: Schema.NonEmptyString,
  book: Schema.Int,
  chapter: Schema.Int,
  verse: Schema.Int,
  content: Schema.String,
  created_at: Schema.Int,
});
const CollectionRow = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  description: nullableString,
  color: nullableString,
  created_at: Schema.Int,
});
const CollectionVerseRow = Schema.Struct({
  collection_id: Schema.NonEmptyString,
  book: Schema.Int,
  chapter: Schema.Int,
  verse: Schema.Int,
  added_at: Schema.Int,
});
const VerseMarkerRow = Schema.Struct({
  id: Schema.NonEmptyString,
  book: Schema.Int,
  chapter: Schema.Int,
  verse: Schema.Int,
  color: Schema.NonEmptyString,
  created_at: Schema.Int,
});
const EgwNoteRow = Schema.Struct({
  id: Schema.NonEmptyString,
  book_code: Schema.NonEmptyString,
  puborder: Schema.Int,
  content: Schema.String,
  created_at: Schema.Int,
});
const EgwMarkerRow = Schema.Struct({
  id: Schema.NonEmptyString,
  book_code: Schema.NonEmptyString,
  puborder: Schema.Int,
  color: Schema.NonEmptyString,
  created_at: Schema.Int,
});
const EgwCollectionItemRow = Schema.Struct({
  collection_id: Schema.NonEmptyString,
  book_code: Schema.NonEmptyString,
  puborder: Schema.Int,
  added_at: Schema.Int,
});
const ReadingPlanRow = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  description: nullableString,
  type: Schema.String,
  source_id: nullableString,
  start_date: nullableInt,
  created_at: Schema.Int,
});
const ReadingPlanItemRow = Schema.Struct({
  id: rowId,
  plan_id: Schema.NonEmptyString,
  day_number: Schema.Int,
  book: Schema.Int,
  start_chapter: Schema.Int,
  end_chapter: nullableInt,
  label: nullableString,
});
const ReadingPlanProgressRow = Schema.Struct({
  plan_id: Schema.NonEmptyString,
  item_id: rowId,
  completed_at: Schema.Int,
});
const MemoryVerseRow = Schema.Struct({
  id: Schema.NonEmptyString,
  book: Schema.Int,
  chapter: Schema.Int,
  verse_start: Schema.Int,
  verse_end: nullableInt,
  created_at: Schema.Int,
});
const MemoryPracticeRow = Schema.Struct({
  id: rowId,
  verse_id: Schema.NonEmptyString,
  mode: Schema.NonEmptyString,
  score: Schema.NullOr(Schema.Number),
  practiced_at: Schema.Int,
});

type CollectionMemberType = 'bookmark' | 'note' | 'marker' | 'reference';

export interface LegacyCollectionMemberResolution {
  readonly memberId: string;
  readonly memberType: CollectionMemberType;
}

export interface LegacyEgwCoordinate {
  readonly bookCode: string;
  readonly puborder: number;
}

export interface WebStateProjectionOptions {
  readonly nextDiagnosticId: (path: string) => MigrationDiagnosticId;
  readonly nextHistoryId: (path: string) => LibraryEntityId;
  readonly nextEntityId: (path: string) => LibraryEntityId;
  readonly timestampFor: (path: string, legacyEpochMilliseconds?: number) => Timestamp;
  readonly planStepId: (path: string, legacyItemId: string | number) => string;
  readonly resolveEgwLocation?: (
    coordinate: LegacyEgwCoordinate,
  ) => typeof ReaderLocation.Type | undefined;
  readonly resolveCollectionMember?: (
    path: string,
    location: typeof ReaderLocation.Type,
  ) => LegacyCollectionMemberResolution | undefined;
}

export interface WebStateProjection {
  readonly commands: ReadonlyArray<DomainMutationCommand>;
  readonly diagnostics: ReadonlyArray<MigrationDiagnostic>;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const legacyIdKey = (id: string | number): string => String(id);

/** Maps the legacy normalized 0..1 score to the nearest canonical integer rating in 0..5. */
export const legacyMemoryPracticeRating = (score: number): number | undefined => {
  if (!Number.isFinite(score) || score < 0 || score > 1) return undefined;
  return Math.round(score * 5);
};

export const projectWebState = (
  input: unknown,
  options: WebStateProjectionOptions,
): WebStateProjection => {
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
    diagnostic('$', 'malformed', 'web state snapshot must decode to an object');
    return { commands, diagnostics };
  }

  const pushCommand = (path: string, candidate: unknown): void => {
    const decoded = Schema.decodeUnknownOption(DomainMutationCommand)(candidate);
    if (Option.isSome(decoded)) {
      commands.push(decoded.value);
      return;
    }
    diagnostic(path, 'malformed', 'legacy row could not produce a canonical mutation');
  };

  const decodeRows = <A>(
    key: string,
    schema: Schema.ConstraintDecoder<A>,
    visit: (row: A, path: string) => void,
  ): void => {
    if (!(key in input)) return;
    const rows = input[key];
    if (!Array.isArray(rows)) {
      diagnostic(key, 'malformed', `legacy ${key} must be an array`);
      return;
    }
    rows.forEach((candidate, index) => {
      const path = `${key}[${index}]`;
      const decoded = Schema.decodeUnknownOption(schema)(candidate);
      if (Option.isSome(decoded)) {
        visit(decoded.value, path);
        return;
      }
      diagnostic(path, 'malformed', `ignored malformed ${key} row`);
    });
  };

  const bibleLocation = (
    path: string,
    book: number,
    chapter: number,
    verse: number | null,
  ): typeof ReaderLocation.Type | undefined => {
    const bibleBook = getBibleBook(book);
    const decodedChapter = Schema.decodeUnknownOption(ChapterNumber)(chapter);
    if (bibleBook === undefined || Option.isNone(decodedChapter) || chapter > bibleBook.chapters) {
      diagnostic(path, 'out-of-range', 'quarantined an invalid Bible coordinate');
      return undefined;
    }
    let location = `/bible/${book}/${chapter}`;
    if (verse !== null) {
      const decodedVerse = Schema.decodeUnknownOption(VerseNumber)(verse);
      if (Option.isNone(decodedVerse)) {
        diagnostic(path, 'out-of-range', 'quarantined an invalid Bible coordinate');
        return undefined;
      }
      location = `${location}/${verse}`;
    }
    return { source: 'bible', resourceId: 'KJV', location };
  };

  const egwLocation = (
    path: string,
    bookCode: string,
    puborder: number,
  ): typeof ReaderLocation.Type | undefined => {
    if (options.resolveEgwLocation === undefined) {
      diagnostic(path, 'ambiguous', 'quarantined an unresolved EGW coordinate');
      return undefined;
    }
    const location = options.resolveEgwLocation({ bookCode, puborder });
    if (location === undefined) {
      diagnostic(path, 'quarantined', 'quarantined an EGW coordinate missing from the resolver');
      return undefined;
    }
    const decoded = Schema.decodeUnknownOption(ReaderLocation)(location);
    if (Option.isNone(decoded) || decoded.value.source !== 'egw') {
      diagnostic(path, 'malformed', 'quarantined an invalid EGW resolver result');
      return undefined;
    }
    return decoded.value;
  };

  const position = input['position'];
  if (position !== undefined && position !== null) {
    const decoded = Schema.decodeUnknownOption(PositionRow)(position);
    if (Option.isNone(decoded))
      diagnostic('position', 'malformed', 'ignored malformed position row');
    else {
      const location = bibleLocation(
        'position',
        decoded.value.book,
        decoded.value.chapter,
        decoded.value.verse,
      );
      if (location !== undefined) {
        pushCommand('position', {
          _tag: 'RecordReading',
          historyId: options.nextHistoryId('position'),
          location,
          progress: 0,
          readAt: options.timestampFor('position'),
        });
      }
    }
  }

  decodeRows('history', HistoryRow, (row, path) => {
    const location = bibleLocation(path, row.book, row.chapter, row.verse);
    if (location === undefined) return;
    pushCommand(path, {
      _tag: 'RecordReading',
      historyId: options.nextHistoryId(path),
      location,
      progress: 0,
      readAt: options.timestampFor(path, row.visited_at),
    });
  });

  decodeRows('bookmarks', BookmarkRow, (row, path) => {
    const location = bibleLocation(path, row.book, row.chapter, row.verse);
    if (location === undefined) return;
    pushCommand(path, { _tag: 'SaveBookmark', id: row.id, location, label: row.note });
  });

  const preferences = input['preferences'];
  if (preferences !== undefined && preferences !== null) {
    const decoded = Schema.decodeUnknownOption(PreferencesRow)(preferences);
    if (Option.isNone(decoded))
      diagnostic('preferences', 'malformed', 'ignored malformed preferences row');
    else {
      const row = decoded.value;
      const field = <A>(
        key: keyof typeof row,
        schema: Schema.ConstraintDecoder<A>,
        fallback: A,
      ): A => {
        const candidate = row[key];
        if (candidate === undefined) return fallback;
        const value = Schema.decodeUnknownOption(schema)(candidate);
        if (Option.isSome(value)) return value.value;
        diagnostic(`preferences.${key}`, 'malformed', `ignored invalid preference field ${key}`);
        return fallback;
      };
      const LegacyTypeface = Schema.Literals([
        'Crimson Pro',
        'Lora',
        'Literata',
        'EB Garamond',
        'Source Sans 3',
        'Georgia',
        'serif',
        'sans-serif',
        'monospace',
      ]);
      const typefaceMap: Record<typeof LegacyTypeface.Type, ReaderTypeface> = {
        'Crimson Pro': 'crimson-pro',
        Lora: 'lora',
        Literata: 'literata',
        'EB Garamond': 'eb-garamond',
        'Source Sans 3': 'source-sans-3',
        Georgia: 'georgia',
        serif: 'system-serif',
        'sans-serif': 'system-sans',
        monospace: 'system-mono',
      };
      const fallbackTypeface: typeof LegacyTypeface.Type = 'Crimson Pro';
      const legacyTypeface = field('font_family', LegacyTypeface, fallbackTypeface);
      const value = new ReadingPreferences({
        colorMode: field(
          'theme',
          Schema.Literals(['system', 'light', 'sepia', 'dark']),
          DEFAULT_READING_PREFERENCES.colorMode,
        ),
        bibleLayout: field(
          'display_mode',
          Schema.Literals(['verse', 'paragraph']),
          DEFAULT_READING_PREFERENCES.bibleLayout,
        ),
        readerTypeface: typefaceMap[legacyTypeface],
        fontSizePx: field(
          'font_size',
          Schema.Number.pipe(
            Schema.check(Schema.isFinite(), Schema.isBetween({ minimum: 14, maximum: 32 })),
          ),
          DEFAULT_READING_PREFERENCES.fontSizePx,
        ),
        lineHeightRatio: field(
          'line_height',
          Schema.Number.pipe(
            Schema.check(Schema.isFinite(), Schema.isBetween({ minimum: 1, maximum: 4 })),
          ),
          DEFAULT_READING_PREFERENCES.lineHeightRatio,
        ),
        letterSpacingEm: field(
          'letter_spacing',
          Schema.Number.pipe(
            Schema.check(Schema.isFinite(), Schema.isBetween({ minimum: -0.02, maximum: 0.1 })),
          ),
          DEFAULT_READING_PREFERENCES.letterSpacingEm,
        ),
        measureCh: DEFAULT_READING_PREFERENCES.measureCh,
        showStrongs: DEFAULT_READING_PREFERENCES.showStrongs,
        showMarginNotes: DEFAULT_READING_PREFERENCES.showMarginNotes,
        showCrossReferences: DEFAULT_READING_PREFERENCES.showCrossReferences,
      });
      pushCommand('preferences', { _tag: 'SetReadingPreferences', preferences: value });
    }
  }

  decodeRows('verse_notes', VerseNoteRow, (row, path) => {
    const location = bibleLocation(path, row.book, row.chapter, row.verse);
    if (location === undefined) return;
    pushCommand(path, {
      _tag: 'SaveNote',
      noteId: row.id,
      source: location.source,
      resourceId: location.resourceId,
      location: location.location,
      content: row.content,
    });
  });

  decodeRows('verse_markers', VerseMarkerRow, (row, path) => {
    const location = bibleLocation(path, row.book, row.chapter, row.verse);
    if (location === undefined) return;
    pushCommand(path, {
      _tag: 'SaveMarker',
      id: row.id,
      location,
      style: 'highlight',
      color: row.color,
    });
  });

  decodeRows('user_cross_refs', UserCrossReferenceRow, (row, path) => {
    const from = bibleLocation(path, row.source_book, row.source_chapter, row.source_verse);
    if (from === undefined) return;
    const to = bibleLocation(path, row.ref_book, row.ref_chapter, row.ref_verse);
    if (to === undefined) return;
    let toEnd: typeof ReaderLocation.Type | null = null;
    if (row.ref_verse_end !== null && row.ref_verse_end !== row.ref_verse) {
      const resolvedEnd = bibleLocation(path, row.ref_book, row.ref_chapter, row.ref_verse_end);
      if (resolvedEnd === undefined) return;
      toEnd = resolvedEnd;
    }
    pushCommand(path, {
      _tag: 'SaveUserCrossReference',
      id: row.id,
      from,
      to,
      toEnd,
      kind: row.type,
      note: row.note,
    });
  });

  decodeRows('cross_ref_classifications', Schema.Unknown, (_row, path) => {
    diagnostic(path, 'discarded', 'discarded unattributed cross-reference classification');
  });

  decodeRows('collections', CollectionRow, (row, path) => {
    pushCommand(path, {
      _tag: 'SaveCollection',
      id: row.id,
      name: row.name,
      description: row.description,
    });
  });

  const addCollectionMember = (
    path: string,
    collectionId: string,
    location: typeof ReaderLocation.Type,
    positionIndex: number,
  ): void => {
    if (options.resolveCollectionMember === undefined) {
      diagnostic(path, 'ambiguous', 'quarantined a collection item without annotation identity');
      return;
    }
    const member = options.resolveCollectionMember(path, location);
    if (member === undefined) {
      diagnostic(path, 'quarantined', 'quarantined a collection item missing from the resolver');
      return;
    }
    pushCommand(path, {
      _tag: 'AddCollectionMember',
      collectionId,
      memberId: member.memberId,
      memberType: member.memberType,
      position: positionIndex,
    });
  };

  decodeRows('collection_verses', CollectionVerseRow, (row, path) => {
    const location = bibleLocation(path, row.book, row.chapter, row.verse);
    if (location === undefined) return;
    addCollectionMember(path, row.collection_id, location, row.added_at);
  });

  decodeRows('egw_notes', EgwNoteRow, (row, path) => {
    const location = egwLocation(path, row.book_code, row.puborder);
    if (location === undefined) return;
    pushCommand(path, {
      _tag: 'SaveNote',
      noteId: row.id,
      source: location.source,
      resourceId: location.resourceId,
      location: location.location,
      content: row.content,
    });
  });

  decodeRows('egw_markers', EgwMarkerRow, (row, path) => {
    const location = egwLocation(path, row.book_code, row.puborder);
    if (location === undefined) return;
    pushCommand(path, {
      _tag: 'SaveMarker',
      id: row.id,
      location,
      style: 'highlight',
      color: row.color,
    });
  });

  decodeRows('egw_collection_items', EgwCollectionItemRow, (row, path) => {
    const location = egwLocation(path, row.book_code, row.puborder);
    if (location === undefined) return;
    addCollectionMember(path, row.collection_id, location, row.added_at);
  });

  const planItems = new Map<
    string,
    Array<{ readonly row: typeof ReadingPlanItemRow.Type; readonly path: string }>
  >();
  decodeRows('reading_plan_items', ReadingPlanItemRow, (row, path) => {
    const existing = planItems.get(row.plan_id);
    if (existing !== undefined) existing.push({ row, path });
    else planItems.set(row.plan_id, [{ row, path }]);
  });
  const planItemIds = new Map<string, string>();
  decodeRows('reading_plans', ReadingPlanRow, (row, path) => {
    const steps: Array<{ readonly id: string; readonly title: string; readonly route: string }> =
      [];
    const items = [...(planItems.get(row.id) ?? [])].sort(
      (left, right) => left.row.day_number - right.row.day_number,
    );
    for (const item of items) {
      if (item.row.end_chapter !== null && item.row.end_chapter !== item.row.start_chapter) {
        diagnostic(item.path, 'ambiguous', 'quarantined a multi-chapter reading plan item');
        continue;
      }
      const location = bibleLocation(item.path, item.row.book, item.row.start_chapter, null);
      if (location === undefined) continue;
      const stepId = options.planStepId(item.path, item.row.id);
      planItemIds.set(`${row.id}:${legacyIdKey(item.row.id)}`, stepId);
      let title = `Day ${item.row.day_number}`;
      if (item.row.label !== null) title = item.row.label;
      steps.push({ id: stepId, title, route: location.location });
    }
    pushCommand(path, {
      _tag: 'SaveReadingPlan',
      id: row.id,
      title: row.name,
      description: row.description,
      steps,
    });
  });

  decodeRows('reading_plan_progress', ReadingPlanProgressRow, (row, path) => {
    const stepId = planItemIds.get(`${row.plan_id}:${legacyIdKey(row.item_id)}`);
    if (stepId === undefined) {
      diagnostic(path, 'quarantined', 'quarantined progress without a migrated plan item');
      return;
    }
    pushCommand(path, {
      _tag: 'SetReadingPlanProgress',
      planId: row.plan_id,
      stepId,
      completedAt: options.timestampFor(path, row.completed_at),
    });
  });

  decodeRows('memory_verses', MemoryVerseRow, (row, path) => {
    if (row.verse_end !== null && row.verse_end !== row.verse_start) {
      diagnostic(
        path,
        'ambiguous',
        'quarantined a memory verse range without a canonical range identity',
      );
      return;
    }
    const location = bibleLocation(path, row.book, row.chapter, row.verse_start);
    if (location === undefined) return;
    pushCommand(path, {
      _tag: 'SaveMemoryVerse',
      id: row.id,
      resourceId: location.resourceId,
      location: location.location,
      prompt: null,
      nextPracticeAt: null,
      intervalDays: 0,
    });
  });

  decodeRows('memory_practice', MemoryPracticeRow, (row, path) => {
    if (row.score === null) {
      diagnostic(path, 'quarantined', 'quarantined memory practice without a score');
      return;
    }
    const rating = legacyMemoryPracticeRating(row.score);
    if (rating === undefined) {
      diagnostic(path, 'out-of-range', 'quarantined memory practice score outside 0..1');
      return;
    }
    pushCommand(path, {
      _tag: 'RecordMemoryPractice',
      id: options.nextEntityId(path),
      memoryVerseId: row.verse_id,
      rating,
      practicedAt: options.timestampFor(path, row.practiced_at),
      nextPracticeAt: null,
      intervalDays: 0,
    });
  });

  return { commands, diagnostics };
};
