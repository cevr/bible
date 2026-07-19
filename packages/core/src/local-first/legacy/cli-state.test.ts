import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';

import { LibraryEntityId } from '../../library-state/model.js';
import { Timestamp } from '../model.js';
import { MigrationDiagnosticId } from '../legacy-migration.js';
import { projectCliState } from './cli-state.js';
import type { CliStateProjectionOptions } from './cli-state.js';

const options: CliStateProjectionOptions = {
  nextDiagnosticId: (path) => Schema.decodeSync(MigrationDiagnosticId)(`cli:diagnostic:${path}`),
  nextHistoryId: (path) => Schema.decodeSync(LibraryEntityId)(`cli:history:${path}`),
  timestampFor: (_path, legacyEpochMilliseconds) => {
    if (legacyEpochMilliseconds === undefined) {
      return Schema.decodeSync(Timestamp)('2026-07-19T12:00:00.000Z');
    }
    return Schema.decodeSync(Timestamp)(`legacy-${String(legacyEpochMilliseconds)}`);
  },
  resolveEgwLocation: (position) => {
    if (position.book_code !== 'AA' || position.puborder !== 17) return undefined;
    return { source: 'egw', resourceId: 'AA', location: '/writings/AA/17' };
  },
};

describe('CLI state legacy projection', () => {
  test('projects a complete snapshot while separating replaceable and unattributed rows', () => {
    const result = projectCliState(
      {
        position: [{ book: 43, chapter: 3, verse: 16 }],
        preferences: [{ theme: 'sepia', display_mode: 'paragraph' }],
        egw_position: [{ book_code: 'AA', page: 12, paragraph: 3, puborder: 17 }],
        user_cross_refs: [
          {
            id: 'legacy-xref-1',
            source_book: 43,
            source_chapter: 3,
            source_verse: 16,
            ref_book: 1,
            ref_chapter: 1,
            ref_verse: 1,
            ref_verse_end: null,
            type: null,
            note: null,
            created_at: 1_700_000_000_000,
          },
        ],
        cross_ref_classifications: [{ private: 'catalog overlay' }],
        ai_search_cache: [{ private: 'derived result' }],
        terminal_palette: [{ private: 'device colors' }],
      },
      options,
    );

    expect(result.commands).toEqual([
      expect.objectContaining({
        _tag: 'RecordReading',
        location: { source: 'bible', resourceId: 'KJV', location: '/bible/43/3/16' },
      }),
      expect.objectContaining({
        _tag: 'SetReadingPreferences',
        preferences: expect.objectContaining({ colorMode: 'sepia', bibleLayout: 'paragraph' }),
      }),
      expect.objectContaining({
        _tag: 'RecordReading',
        location: { source: 'egw', resourceId: 'AA', location: '/writings/AA/17' },
      }),
      {
        _tag: 'SaveUserCrossReference',
        id: 'legacy-xref-1',
        from: { source: 'bible', resourceId: 'KJV', location: '/bible/43/3/16' },
        to: { source: 'bible', resourceId: 'KJV', location: '/bible/1/1/1' },
        toEnd: null,
        kind: null,
        note: null,
      },
    ]);
    expect(result.diagnostics.map((entry) => entry.path)).toEqual([
      'cross_ref_classifications',
      'ai_search_cache',
      'terminal_palette',
    ]);
    expect(result.diagnostics.map((entry) => entry.message).join(' ')).not.toContain('private');
  });

  test('preserves a valid preference sibling and diagnoses only the malformed field', () => {
    const result = projectCliState({ preferences: [{ theme: 'dark', display_mode: 42 }] }, options);
    const command = result.commands[0];

    expect(command?._tag).toBe('SetReadingPreferences');
    if (command?._tag !== 'SetReadingPreferences') return;
    expect(command.preferences.colorMode).toBe('dark');
    expect(command.preferences.bibleLayout).toBe('verse');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ path: 'preferences[0].display_mode', category: 'malformed' }),
    ]);
  });

  test('keeps valid rows while diagnosing malformed and out-of-range rows by table index', () => {
    const result = projectCliState(
      {
        position: [
          { book: 'Genesis', chapter: 1, verse: 1 },
          { book: 1, chapter: 51, verse: 1 },
          { book: 1, chapter: 1, verse: 1 },
        ],
      },
      options,
    );

    expect(result.commands).toHaveLength(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ path: 'position[0]', category: 'malformed' }),
      expect.objectContaining({ path: 'position[1]', category: 'out-of-range' }),
    ]);
  });

  test('quarantines unresolved writings positions', () => {
    const result = projectCliState(
      { egw_position: [{ book_code: 'UNKNOWN', page: null, paragraph: null, puborder: 1 }] },
      options,
    );

    expect(result.commands).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ path: 'egw_position[0]', category: 'quarantined' }),
    ]);
  });

  test('preserves note, type, and the complete cross-reference range', () => {
    const result = projectCliState(
      {
        user_cross_refs: [
          {
            id: 'legacy-xref-note',
            source_book: 43,
            source_chapter: 3,
            source_verse: 16,
            ref_book: 1,
            ref_chapter: 1,
            ref_verse: 1,
            ref_verse_end: 2,
            type: 'thematic',
            note: 'private reader note',
            created_at: 1_700_000_000_000,
          },
        ],
      },
      options,
    );

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toEqual(
      expect.objectContaining({
        kind: 'thematic',
        note: 'private reader note',
        toEnd: { source: 'bible', resourceId: 'KJV', location: '/bible/1/1/2' },
      }),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.diagnostics.map((entry) => entry.message).join(' ')).not.toContain('private');
  });

  test('accepts already-empty tables without manufacturing diagnostics', () => {
    const result = projectCliState(
      {
        position: [],
        preferences: [],
        egw_position: [],
        user_cross_refs: [],
        cross_ref_classifications: [],
        ai_search_cache: [],
        terminal_palette: [],
      },
      options,
    );

    expect(result).toEqual({ commands: [], diagnostics: [] });
  });
});
