import { Option, Predicate, Schema } from 'effect';

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

// Wire fields absent in the legacy snapshot; the command schema expects `null` on the encoded side.
const wireNull = Option.getOrNull(Option.none<never>());

const rowId = Schema.Union([Schema.String, Schema.Finite]);
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
  score: Schema.NullOr(Schema.Finite),
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
  readonly resolveEgwLocation?: (coordinate: LegacyEgwCoordinate) => Option.Option<ReaderLocation>;
  readonly resolveCollectionMember?: (
    path: string,
    location: ReaderLocation,
  ) => Option.Option<LegacyCollectionMemberResolution>;
}

export interface WebStateProjection {
  readonly commands: ReadonlyArray<DomainMutationCommand>;
  readonly diagnostics: ReadonlyArray<MigrationDiagnostic>;
}

const legacyIdKey = (id: string | number): string => String(id);

/** Maps the legacy normalized 0..1 score to the nearest canonical integer rating in 0..5. */
export const legacyMemoryPracticeRating = (score: number): Option.Option<number> => {
  if (!Number.isFinite(score) || score < 0 || score > 1) return Option.none();
  return Option.some(Math.round(score * 5));
};

export const projectWebState = (
  // oxlint-disable-next-line effect/noUnknownParameters -- legacy snapshot I/O boundary: raw JSON is decoded field-by-field with schemas below
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

  if (!Predicate.isObject(input)) {
    diagnostic('$', 'malformed', 'web state snapshot must decode to an object');
    return { commands, diagnostics };
  }

  // oxlint-disable-next-line effect/noUnknownParameters -- candidate is decoded via DomainMutationCommand schema on the next line
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
    verse: Option.Option<number>,
  ): Option.Option<ReaderLocation> => {
    const bibleBook = getBibleBook(book);
    const decodedChapter = Schema.decodeOption(ChapterNumber)(chapter);
    if (
      Option.isNone(bibleBook) ||
      Option.isNone(decodedChapter) ||
      chapter > bibleBook.value.chapters
    ) {
      diagnostic(path, 'out-of-range', 'quarantined an invalid Bible coordinate');
      return Option.none();
    }
    let location = `/bible/${book}/${chapter}`;
    if (Option.isSome(verse)) {
      const decodedVerse = Schema.decodeOption(VerseNumber)(verse.value);
      if (Option.isNone(decodedVerse)) {
        diagnostic(path, 'out-of-range', 'quarantined an invalid Bible coordinate');
        return Option.none();
      }
      location = `${location}/${verse.value}`;
    }
    return Option.some({ source: 'bible', resourceId: 'KJV', location });
  };

  const egwLocation = (
    path: string,
    bookCode: string,
    puborder: number,
  ): Option.Option<ReaderLocation> => {
    const resolve = Option.fromNullishOr(options.resolveEgwLocation);
    if (Option.isNone(resolve)) {
      diagnostic(path, 'ambiguous', 'quarantined an unresolved EGW coordinate');
      return Option.none();
    }
    const location = resolve.value({ bookCode, puborder });
    if (Option.isNone(location)) {
      diagnostic(path, 'quarantined', 'quarantined an EGW coordinate missing from the resolver');
      return Option.none();
    }
    const decoded = Schema.decodeOption(ReaderLocation)(location.value);
    if (Option.isNone(decoded) || decoded.value.source !== 'egw') {
      diagnostic(path, 'malformed', 'quarantined an invalid EGW resolver result');
      return Option.none();
    }
    return decoded;
  };

  const position = input['position'];
  if (Predicate.isNotNullish(position)) {
    const decoded = Schema.decodeUnknownOption(PositionRow)(position);
    if (Option.isNone(decoded))
      diagnostic('position', 'malformed', 'ignored malformed position row');
    else {
      const location = bibleLocation(
        'position',
        decoded.value.book,
        decoded.value.chapter,
        Option.fromNullishOr(decoded.value.verse),
      );
      if (Option.isSome(location)) {
        pushCommand('position', {
          _tag: 'RecordReading',
          historyId: options.nextHistoryId('position'),
          location: location.value,
          progress: 0,
          readAt: options.timestampFor('position'),
        });
      }
    }
  }

  decodeRows('history', HistoryRow, (row, path) => {
    const location = bibleLocation(path, row.book, row.chapter, Option.fromNullishOr(row.verse));
    if (Option.isNone(location)) return;
    pushCommand(path, {
      _tag: 'RecordReading',
      historyId: options.nextHistoryId(path),
      location: location.value,
      progress: 0,
      readAt: options.timestampFor(path, row.visited_at),
    });
  });

  decodeRows('bookmarks', BookmarkRow, (row, path) => {
    const location = bibleLocation(path, row.book, row.chapter, Option.fromNullishOr(row.verse));
    if (Option.isNone(location)) return;
    pushCommand(path, {
      _tag: 'SaveBookmark',
      id: row.id,
      location: location.value,
      label: row.note,
    });
  });

  const preferences = input['preferences'];
  if (Predicate.isNotNullish(preferences)) {
    const decoded = Schema.decodeOption(PreferencesRow)(preferences);
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
        if (Predicate.isUndefined(candidate)) return fallback;
        const value = Schema.decodeOption(schema)(candidate);
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
      const typefaceMap = {
        'Crimson Pro': 'crimson-pro',
        Lora: 'lora',
        Literata: 'literata',
        'EB Garamond': 'eb-garamond',
        'Source Sans 3': 'source-sans-3',
        Georgia: 'georgia',
        serif: 'system-serif',
        'sans-serif': 'system-sans',
        monospace: 'system-mono',
      } satisfies Record<typeof LegacyTypeface.Type, ReaderTypeface>;
      const fallbackTypeface: typeof LegacyTypeface.Type = 'Crimson Pro';
      const legacyTypeface = field('font_family', LegacyTypeface, fallbackTypeface);
      const value = ReadingPreferences.make({
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
          Schema.Finite.pipe(
            Schema.check(Schema.isFinite(), Schema.isBetween({ minimum: 14, maximum: 32 })),
          ),
          DEFAULT_READING_PREFERENCES.fontSizePx,
        ),
        lineHeightRatio: field(
          'line_height',
          Schema.Finite.pipe(
            Schema.check(Schema.isFinite(), Schema.isBetween({ minimum: 1, maximum: 4 })),
          ),
          DEFAULT_READING_PREFERENCES.lineHeightRatio,
        ),
        letterSpacingEm: field(
          'letter_spacing',
          Schema.Finite.pipe(
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
    const location = bibleLocation(path, row.book, row.chapter, Option.fromNullishOr(row.verse));
    if (Option.isNone(location)) return;
    pushCommand(path, {
      _tag: 'SaveNote',
      noteId: row.id,
      source: location.value.source,
      resourceId: location.value.resourceId,
      location: location.value.location,
      content: row.content,
    });
  });

  decodeRows('verse_markers', VerseMarkerRow, (row, path) => {
    const location = bibleLocation(path, row.book, row.chapter, Option.fromNullishOr(row.verse));
    if (Option.isNone(location)) return;
    pushCommand(path, {
      _tag: 'SaveMarker',
      id: row.id,
      location: location.value,
      style: 'highlight',
      color: row.color,
    });
  });

  decodeRows('user_cross_refs', UserCrossReferenceRow, (row, path) => {
    const from = bibleLocation(
      path,
      row.source_book,
      row.source_chapter,
      Option.fromNullishOr(row.source_verse),
    );
    if (Option.isNone(from)) return;
    const to = bibleLocation(
      path,
      row.ref_book,
      row.ref_chapter,
      Option.fromNullishOr(row.ref_verse),
    );
    if (Option.isNone(to)) return;
    let toEnd = Option.none<ReaderLocation>();
    if (Predicate.isNotNull(row.ref_verse_end) && row.ref_verse_end !== row.ref_verse) {
      const resolvedEnd = bibleLocation(
        path,
        row.ref_book,
        row.ref_chapter,
        Option.fromNullishOr(row.ref_verse_end),
      );
      if (Option.isNone(resolvedEnd)) return;
      toEnd = resolvedEnd;
    }
    pushCommand(path, {
      _tag: 'SaveUserCrossReference',
      id: row.id,
      from: from.value,
      to: to.value,
      toEnd: Option.getOrNull(toEnd),
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
    location: ReaderLocation,
    positionIndex: number,
  ): void => {
    const resolve = Option.fromNullishOr(options.resolveCollectionMember);
    if (Option.isNone(resolve)) {
      diagnostic(path, 'ambiguous', 'quarantined a collection item without annotation identity');
      return;
    }
    const member = resolve.value(path, location);
    if (Option.isNone(member)) {
      diagnostic(path, 'quarantined', 'quarantined a collection item missing from the resolver');
      return;
    }
    pushCommand(path, {
      _tag: 'AddCollectionMember',
      collectionId,
      memberId: member.value.memberId,
      memberType: member.value.memberType,
      position: positionIndex,
    });
  };

  decodeRows('collection_verses', CollectionVerseRow, (row, path) => {
    const location = bibleLocation(path, row.book, row.chapter, Option.fromNullishOr(row.verse));
    if (Option.isNone(location)) return;
    addCollectionMember(path, row.collection_id, location.value, row.added_at);
  });

  decodeRows('egw_notes', EgwNoteRow, (row, path) => {
    const location = egwLocation(path, row.book_code, row.puborder);
    if (Option.isNone(location)) return;
    pushCommand(path, {
      _tag: 'SaveNote',
      noteId: row.id,
      source: location.value.source,
      resourceId: location.value.resourceId,
      location: location.value.location,
      content: row.content,
    });
  });

  decodeRows('egw_markers', EgwMarkerRow, (row, path) => {
    const location = egwLocation(path, row.book_code, row.puborder);
    if (Option.isNone(location)) return;
    pushCommand(path, {
      _tag: 'SaveMarker',
      id: row.id,
      location: location.value,
      style: 'highlight',
      color: row.color,
    });
  });

  decodeRows('egw_collection_items', EgwCollectionItemRow, (row, path) => {
    const location = egwLocation(path, row.book_code, row.puborder);
    if (Option.isNone(location)) return;
    addCollectionMember(path, row.collection_id, location.value, row.added_at);
  });

  const planItems = new Map<
    string,
    Array<{ readonly row: typeof ReadingPlanItemRow.Type; readonly path: string }>
  >();
  decodeRows('reading_plan_items', ReadingPlanItemRow, (row, path) => {
    const existing = Option.fromNullishOr(planItems.get(row.plan_id));
    if (Option.isSome(existing)) existing.value.push({ row, path });
    else planItems.set(row.plan_id, [{ row, path }]);
  });
  const planItemIds = new Map<string, string>();
  decodeRows('reading_plans', ReadingPlanRow, (row, path) => {
    const steps: Array<{
      readonly id: string;
      readonly title: string;
      readonly route: string;
      readonly endRoute?: string;
    }> = [];
    const items = [...(planItems.get(row.id) ?? [])].sort(
      (left, right) => left.row.day_number - right.row.day_number,
    );
    for (const item of items) {
      const location = bibleLocation(
        item.path,
        item.row.book,
        item.row.start_chapter,
        Option.none(),
      );
      if (Option.isNone(location)) continue;
      let endRoute = Option.none<string>();
      if (Predicate.isNotNull(item.row.end_chapter)) {
        if (item.row.end_chapter < item.row.start_chapter) {
          diagnostic(item.path, 'out-of-range', 'quarantined a reversed reading plan range');
          continue;
        }
        const end = bibleLocation(item.path, item.row.book, item.row.end_chapter, Option.none());
        if (Option.isNone(end)) continue;
        endRoute = Option.some(end.value.location);
      }
      const stepId = options.planStepId(item.path, item.row.id);
      planItemIds.set(`${row.id}:${legacyIdKey(item.row.id)}`, stepId);
      let title = `Day ${item.row.day_number}`;
      if (Predicate.isNotNull(item.row.label)) title = item.row.label;
      steps.push({
        id: stepId,
        title,
        route: location.value.location,
        endRoute: Option.getOrUndefined(endRoute),
      });
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
    const stepId = Option.fromNullishOr(
      planItemIds.get(`${row.plan_id}:${legacyIdKey(row.item_id)}`),
    );
    if (Option.isNone(stepId)) {
      diagnostic(path, 'quarantined', 'quarantined progress without a migrated plan item');
      return;
    }
    pushCommand(path, {
      _tag: 'SetReadingPlanProgress',
      planId: row.plan_id,
      stepId: stepId.value,
      completedAt: options.timestampFor(path, row.completed_at),
    });
  });

  decodeRows('memory_verses', MemoryVerseRow, (row, path) => {
    const location = bibleLocation(path, row.book, row.chapter, Option.some(row.verse_start));
    if (Option.isNone(location)) return;
    let endLocation = Option.none<string>();
    if (Predicate.isNotNull(row.verse_end)) {
      if (row.verse_end < row.verse_start) {
        diagnostic(path, 'out-of-range', 'quarantined a reversed memory verse range');
        return;
      }
      const end = bibleLocation(path, row.book, row.chapter, Option.some(row.verse_end));
      if (Option.isNone(end)) return;
      endLocation = Option.some(end.value.location);
    }
    pushCommand(path, {
      _tag: 'SaveMemoryVerse',
      id: row.id,
      resourceId: location.value.resourceId,
      location: location.value.location,
      endLocation: Option.getOrUndefined(endLocation),
      prompt: wireNull,
      nextPracticeAt: wireNull,
      intervalDays: 0,
    });
  });

  decodeRows('memory_practice', MemoryPracticeRow, (row, path) => {
    if (Predicate.isNull(row.score)) {
      diagnostic(path, 'quarantined', 'quarantined memory practice without a score');
      return;
    }
    const rating = legacyMemoryPracticeRating(row.score);
    if (Option.isNone(rating)) {
      diagnostic(path, 'out-of-range', 'quarantined memory practice score outside 0..1');
      return;
    }
    pushCommand(path, {
      _tag: 'RecordMemoryPractice',
      id: options.nextEntityId(path),
      memoryVerseId: row.verse_id,
      rating: rating.value,
      practicedAt: options.timestampFor(path, row.practiced_at),
      nextPracticeAt: wireNull,
      intervalDays: 0,
    });
  });

  return { commands, diagnostics };
};
