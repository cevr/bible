import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';

import { decodeBackupJson } from './effect-service';

const validArchive = {
  version: 1,
  exportedAt: '2026-07-13T12:00:00.000Z',
  bookmarks: [],
  history: [],
  preferences: {
    theme: 'system',
    displayMode: 'verse',
    fontFamily: 'Crimson Pro',
    fontSize: 18,
    lineHeight: 1.8,
    letterSpacing: 0.01,
  },
  notes: [],
  markers: [],
  collections: [],
};

describe('BackupArchive', () => {
  test('decodes a complete version 1 archive', async () => {
    const archive = await Effect.runPromise(decodeBackupJson(JSON.stringify(validArchive)));

    expect(archive.version).toBe(1);
    expect(archive.preferences.theme).toBe('system');
  });

  test('rejects an unsupported archive version before restore', async () => {
    const result = await Effect.runPromiseExit(
      decodeBackupJson(JSON.stringify({ ...validArchive, version: 2 })),
    );

    expect(result._tag).toBe('Failure');
  });

  test('rejects malformed nested records before restore', async () => {
    const malformed = {
      ...validArchive,
      bookmarks: [{ id: 'bookmark-1', reference: { book: 'Genesis', chapter: 1 }, createdAt: 1 }],
    };

    const result = await Effect.runPromiseExit(decodeBackupJson(JSON.stringify(malformed)));

    expect(result._tag).toBe('Failure');
  });
});
