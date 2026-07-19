import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';

import { LibraryEntityId } from '../../library-state/model.js';
import { Timestamp } from '../model.js';
import { MigrationDiagnosticId } from '../legacy-migration.js';
import { projectDesktopCache } from './desktop-cache.js';
import type { DesktopCacheProjectionOptions } from './desktop-cache.js';

const options: DesktopCacheProjectionOptions = {
  nextDiagnosticId: (path) =>
    Schema.decodeSync(MigrationDiagnosticId)(`desktop-cache:diagnostic:${path}`),
  nextHistoryId: (path) => Schema.decodeSync(LibraryEntityId)(`desktop-cache:history:${path}`),
  timestampFor: () => Schema.decodeSync(Timestamp)('2026-07-19T12:00:00.000Z'),
  resolveEgwLocation: (position) => {
    if (position.book_id !== 127) return undefined;
    if (position.paragraph_id !== 'paragraph-3') return undefined;
    return { source: 'egw', resourceId: 'AA', location: '/writings/AA/3' };
  },
};

describe('desktop cache legacy projection', () => {
  test('projects complete Bible and resolved writings positions and discards cache counts', () => {
    const result = projectDesktopCache(
      {
        bible_last_position: [{ book: 43, chapter: 3, verse: 16 }],
        last_position: [{ book_id: 127, para_id: 'chapter-3', paragraph_id: 'paragraph-3' }],
        book_lists: [{ json: 'private cached response' }],
        tocs: [{ json: 'private cached response' }, { json: 'private cached response' }],
        chapters: [],
        folders: [],
        folder_books: [],
      },
      options,
    );

    expect(result.commands).toEqual([
      expect.objectContaining({
        _tag: 'RecordReading',
        location: { source: 'bible', resourceId: 'KJV', location: '/bible/43/3/16' },
      }),
      expect.objectContaining({
        _tag: 'RecordReading',
        location: { source: 'egw', resourceId: 'AA', location: '/writings/AA/3' },
      }),
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ path: 'book_lists', category: 'discarded' }),
      expect.objectContaining({ path: 'tocs', category: 'discarded' }),
    ]);
    expect(result.diagnostics.map((entry) => entry.message).join(' ')).not.toContain('private');
  });

  test('keeps valid sibling rows while diagnosing invalid Bible coordinates exactly', () => {
    const result = projectDesktopCache(
      {
        bible_last_position: [
          { book: 67, chapter: 1, verse: 1 },
          { book: 1, chapter: 2, verse: null },
        ],
        last_position: [],
      },
      options,
    );

    expect(result.commands).toEqual([
      expect.objectContaining({
        location: { source: 'bible', resourceId: 'KJV', location: '/bible/1/2' },
      }),
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        path: 'bible_last_position[0].book',
        category: 'out-of-range',
      }),
    );
  });

  test('rejects a chapter outside its canonical book without clamping it', () => {
    const result = projectDesktopCache(
      {
        bible_last_position: [{ book: 1, chapter: 51, verse: 1 }],
        last_position: [],
      },
      options,
    );

    expect(result.commands).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        path: 'bible_last_position[0].chapter',
        category: 'out-of-range',
      }),
    ]);
  });

  test('quarantines an unresolved writings position without guessing a route', () => {
    const result = projectDesktopCache(
      {
        bible_last_position: [],
        last_position: [{ book_id: 999, para_id: 'legacy', paragraph_id: null }],
      },
      options,
    );

    expect(result.commands).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ path: 'last_position[0]', category: 'quarantined' }),
    ]);
  });

  test('accepts already-empty tables without manufacturing diagnostics', () => {
    const result = projectDesktopCache(
      {
        bible_last_position: [],
        last_position: [],
        book_lists: [],
        tocs: [],
        chapters: [],
        folders: [],
        folder_books: [],
      },
      options,
    );

    expect(result).toEqual({ commands: [], diagnostics: [] });
  });
});
