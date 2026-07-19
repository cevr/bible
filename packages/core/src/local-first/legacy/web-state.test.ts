import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';

import { LibraryEntityId, ReaderLocation } from '../../library-state/model.js';
import { MigrationDiagnosticId } from '../legacy-migration.js';
import { Timestamp } from '../model.js';
import { legacyMemoryPracticeRating, projectWebState } from './web-state.js';

const options = {
  nextDiagnosticId: (path: string) => Schema.decodeSync(MigrationDiagnosticId)(`web-state:${path}`),
  nextHistoryId: (path: string) => Schema.decodeSync(LibraryEntityId)(`history:${path}`),
  nextEntityId: (path: string) => Schema.decodeSync(LibraryEntityId)(`entity:${path}`),
  timestampFor: (path: string, legacyEpochMilliseconds?: number) => {
    let suffix = 'snapshot';
    if (legacyEpochMilliseconds !== undefined) suffix = String(legacyEpochMilliseconds);
    return Schema.decodeSync(Timestamp)(`${path}:${suffix}`);
  },
  planStepId: (_path: string, legacyItemId: string | number) => `legacy-step:${legacyItemId}`,
  resolveEgwLocation: ({ bookCode, puborder }: { bookCode: string; puborder: number }) =>
    Schema.decodeSync(ReaderLocation)({
      source: 'egw',
      resourceId: '123',
      location: `/writings/123/${bookCode}-${puborder}`,
    }),
  resolveCollectionMember: (path: string) => ({
    memberId: `annotation:${path}`,
    memberType: 'marker' as const,
  }),
};

const tags = (commands: ReturnType<typeof projectWebState>['commands']) =>
  commands.map((command) => command._tag);

describe('web state legacy projection', () => {
  test('projects a representative snapshot without losing valid portable state', () => {
    const result = projectWebState(
      {
        position: { book: 43, chapter: 3, verse: 16 },
        history: [{ id: 8, book: 1, chapter: 1, verse: null, visited_at: 100 }],
        bookmarks: [
          { id: 'bookmark-1', book: 43, chapter: 3, verse: 16, note: 'Promise', created_at: 1 },
        ],
        preferences: {
          theme: 'sepia',
          display_mode: 'paragraph',
          font_family: 'Lora',
          font_size: 22,
          line_height: 1.9,
          letter_spacing: 0.02,
        },
        verse_notes: [
          { id: 'note-1', book: 43, chapter: 3, verse: 16, content: 'Private', created_at: 2 },
        ],
        verse_markers: [
          { id: 'marker-1', book: 43, chapter: 3, verse: 16, color: 'gold', created_at: 3 },
        ],
        user_cross_refs: [
          {
            id: 'xref-1',
            source_book: 43,
            source_chapter: 3,
            source_verse: 16,
            ref_book: 1,
            ref_chapter: 1,
            ref_verse: 1,
            ref_verse_end: null,
            type: null,
            note: null,
            created_at: 4,
          },
        ],
        collections: [
          {
            id: 'collection-1',
            name: 'Promises',
            description: null,
            color: null,
            created_at: 5,
          },
        ],
        collection_verses: [
          { collection_id: 'collection-1', book: 43, chapter: 3, verse: 16, added_at: 6 },
        ],
        egw_notes: [
          { id: 'egw-note-1', book_code: 'DA', puborder: 12, content: 'Private', created_at: 7 },
        ],
        egw_markers: [
          { id: 'egw-marker-1', book_code: 'DA', puborder: 12, color: 'blue', created_at: 8 },
        ],
        egw_collection_items: [
          { collection_id: 'collection-1', book_code: 'DA', puborder: 12, added_at: 9 },
        ],
        reading_plan_items: [
          {
            id: 17,
            plan_id: 'plan-1',
            day_number: 1,
            book: 43,
            start_chapter: 3,
            end_chapter: null,
            label: 'The new birth',
          },
        ],
        reading_plans: [
          {
            id: 'plan-1',
            name: 'John',
            description: null,
            type: 'custom',
            source_id: null,
            start_date: null,
            created_at: 10,
          },
        ],
        reading_plan_progress: [{ plan_id: 'plan-1', item_id: 17, completed_at: 11 }],
        memory_verses: [
          {
            id: 'memory-1',
            book: 43,
            chapter: 3,
            verse_start: 16,
            verse_end: null,
            created_at: 12,
          },
        ],
        memory_practice: [
          { id: 19, verse_id: 'memory-1', mode: 'recall', score: 0.8, practiced_at: 13 },
        ],
      },
      options,
    );

    expect(tags(result.commands)).toEqual([
      'RecordReading',
      'RecordReading',
      'SaveBookmark',
      'SetReadingPreferences',
      'SaveNote',
      'SaveMarker',
      'SaveUserCrossReference',
      'SaveCollection',
      'AddCollectionMember',
      'SaveNote',
      'SaveMarker',
      'AddCollectionMember',
      'SaveReadingPlan',
      'SetReadingPlanProgress',
      'SaveMemoryVerse',
      'RecordMemoryPractice',
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(result.commands).toContainEqual(
      expect.objectContaining({
        _tag: 'SetReadingPlanProgress',
        planId: 'plan-1',
        stepId: 'legacy-step:17',
      }),
    );
    expect(result.commands).toContainEqual(
      expect.objectContaining({ _tag: 'RecordMemoryPractice', rating: 4 }),
    );
  });

  test('keeps valid siblings and preference fields when another field or row is malformed', () => {
    const result = projectWebState(
      {
        preferences: { theme: 'dark', font_family: 42, font_size: 20 },
        bookmarks: [
          { id: 'good', book: 1, chapter: 1, verse: 1, note: null, created_at: 1 },
          { id: 'bad', book: 'Genesis' },
        ],
      },
      options,
    );
    const preference = result.commands.find((command) => command._tag === 'SetReadingPreferences');

    expect(preference).toEqual(
      expect.objectContaining({
        preferences: expect.objectContaining({
          colorMode: 'dark',
          readerTypeface: 'crimson-pro',
          fontSizePx: 20,
        }),
      }),
    );
    expect(tags(result.commands)).toContain('SaveBookmark');
    expect(result.diagnostics.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(['preferences.font_family', 'bookmarks[1]']),
    );
  });

  test('quarantines out-of-range Bible coordinates without clamping', () => {
    const result = projectWebState(
      {
        bookmarks: [{ id: 'bad', book: 1, chapter: 51, verse: 1, note: null, created_at: 1 }],
      },
      options,
    );

    expect(result.commands).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ path: 'bookmarks[0]', category: 'out-of-range' }),
    ]);
  });

  test('quarantines an ambiguous EGW coordinate when no resolver is supplied', () => {
    const { resolveEgwLocation: _resolveEgwLocation, ...withoutEgwResolver } = options;
    const result = projectWebState(
      {
        egw_notes: [
          { id: 'egw-note', book_code: 'DA', puborder: 12, content: 'Private', created_at: 1 },
        ],
      },
      withoutEgwResolver,
    );

    expect(result.commands).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ path: 'egw_notes[0]', category: 'ambiguous' }),
    ]);
  });

  test('discards unattributed classifications without exposing their content', () => {
    const result = projectWebState(
      { cross_ref_classifications: [{ type: 'private-classification' }] },
      options,
    );

    expect(result.commands).toEqual([]);
    expect(result.diagnostics[0]).toEqual(
      expect.objectContaining({
        path: 'cross_ref_classifications[0]',
        category: 'discarded',
      }),
    );
    expect(result.diagnostics[0]?.message).not.toContain('private-classification');
  });

  test('uses one stable injected step identity for plan definition and progress', () => {
    const result = projectWebState(
      {
        reading_plan_items: [
          {
            id: 91,
            plan_id: 'plan',
            day_number: 1,
            book: 1,
            start_chapter: 1,
            end_chapter: null,
            label: null,
          },
        ],
        reading_plans: [
          {
            id: 'plan',
            name: 'Plan',
            description: null,
            type: 'custom',
            source_id: null,
            start_date: null,
            created_at: 1,
          },
        ],
        reading_plan_progress: [{ plan_id: 'plan', item_id: 91, completed_at: 2 }],
      },
      options,
    );
    const plan = result.commands.find((command) => command._tag === 'SaveReadingPlan');
    const progress = result.commands.find((command) => command._tag === 'SetReadingPlanProgress');

    expect(plan).toEqual(
      expect.objectContaining({ steps: [expect.objectContaining({ id: 'legacy-step:91' })] }),
    );
    expect(progress).toEqual(expect.objectContaining({ stepId: 'legacy-step:91' }));
  });

  test('converts normalized legacy recall scores to canonical 0..5 ratings', () => {
    expect(legacyMemoryPracticeRating(0)).toBe(0);
    expect(legacyMemoryPracticeRating(0.49)).toBe(2);
    expect(legacyMemoryPracticeRating(0.5)).toBe(3);
    expect(legacyMemoryPracticeRating(1)).toBe(5);
    expect(legacyMemoryPracticeRating(1.01)).toBeUndefined();
  });

  test('quarantines a malformed root', () => {
    const result = projectWebState('not-a-snapshot', options);
    expect(result.commands).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ path: '$', category: 'malformed' }),
    ]);
  });
});
