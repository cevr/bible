import { describe, expect, test } from 'bun:test';

import type { SqliteDatabase } from './sqlite-database.js';
import {
  makeResolvedWebStateProjection,
  resolveLegacyEgwCoordinates,
  snapshotLegacyWebState,
} from './web-state-migration.js';

describe('legacy web state snapshot', () => {
  test('reads an exact ordered snapshot without writing the legacy database', async () => {
    const queries: string[] = [];
    let writes = 0;
    const database = {
      query: async (sql: string) => {
        queries.push(sql);
        return [{ sql }];
      },
      write: async () => {
        writes += 1;
        return 0;
      },
    } as unknown as SqliteDatabase;

    const snapshot = await snapshotLegacyWebState(database);

    expect(snapshot['position']).toEqual({ sql: 'SELECT * FROM position ORDER BY id' });
    expect(snapshot['memory_practice']).toEqual([
      { sql: 'SELECT * FROM memory_practice ORDER BY practiced_at, id' },
    ]);
    expect(queries).toHaveLength(19);
    expect(writes).toBe(0);
  });

  test('fails a corrupt source snapshot instead of activating partial state', async () => {
    const database = {
      query: async (sql: string) => {
        if (sql.includes('verse_notes')) throw new Error('database disk image is malformed');
        return [];
      },
    } as unknown as SqliteDatabase;

    return expect(snapshotLegacyWebState(database)).rejects.toThrow('database disk image');
  });

  test('treats an absent optional legacy table as an empty sibling', async () => {
    const database = {
      query: async (sql: string) => {
        if (sql.includes('egw_markers')) throw new Error('no such table: egw_markers');
        return [];
      },
    } as unknown as SqliteDatabase;

    const snapshot = await snapshotLegacyWebState(database);

    expect(snapshot['egw_markers']).toEqual([]);
  });

  test('preserves uniquely resolved Bible and EGW annotations and collection memberships', () => {
    const egwLocation = {
      source: 'egw' as const,
      resourceId: '127',
      location: '/writings/127/p/DA-12',
    };
    const projection = makeResolvedWebStateProjection(
      {
        verse_markers: [
          { id: 'bible-marker', book: 43, chapter: 3, verse: 16, color: 'gold', created_at: 1 },
        ],
        collection_verses: [
          { collection_id: 'collection', book: 43, chapter: 3, verse: 16, added_at: 1 },
        ],
        egw_notes: [
          { id: 'egw-note', book_code: 'DA', puborder: 12, content: 'Private', created_at: 1 },
        ],
        egw_collection_items: [
          { collection_id: 'collection', book_code: 'DA', puborder: 12, added_at: 2 },
        ],
      },
      'fixture',
      new Map([['da:12', egwLocation]]),
    );

    expect(projection.commands).toContainEqual(
      expect.objectContaining({ _tag: 'SaveNote', source: 'egw', resourceId: '127' }),
    );
    expect(projection.commands).toContainEqual(
      expect.objectContaining({
        _tag: 'AddCollectionMember',
        memberId: 'bible-marker',
        memberType: 'marker',
      }),
    );
    expect(projection.commands).toContainEqual(
      expect.objectContaining({
        _tag: 'AddCollectionMember',
        memberId: 'egw-note',
        memberType: 'note',
      }),
    );
  });

  test('quarantines ambiguous and unresolved collection identities without leaking content', () => {
    const projection = makeResolvedWebStateProjection(
      {
        verse_notes: [
          { id: 'note', book: 43, chapter: 3, verse: 16, content: 'Secret', created_at: 1 },
        ],
        verse_markers: [
          { id: 'marker', book: 43, chapter: 3, verse: 16, color: 'gold', created_at: 1 },
        ],
        collection_verses: [
          { collection_id: 'collection', book: 43, chapter: 3, verse: 16, added_at: 1 },
        ],
        egw_notes: [
          { id: 'egw-note', book_code: 'XX', puborder: 9, content: 'Hidden', created_at: 1 },
        ],
      },
      'fixture',
      new Map(),
    );

    expect(projection.commands).not.toContainEqual(
      expect.objectContaining({ _tag: 'AddCollectionMember' }),
    );
    expect(projection.diagnostics.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(['collection_verses[0]', 'egw_notes[0]']),
    );
    expect(projection.diagnostics.map((entry) => entry.message).join(' ')).not.toContain('Secret');
    expect(projection.diagnostics.map((entry) => entry.message).join(' ')).not.toContain('Hidden');
  });

  test('continues with diagnostics when the replaceable Writings corpus is unavailable', async () => {
    const snapshot = {
      egw_notes: [
        { id: 'egw-note', book_code: 'DA', puborder: 12, content: 'Private', created_at: 1 },
      ],
      egw_markers: [
        { id: 'egw-marker', book_code: 'DA', puborder: 12, color: 'gold', created_at: 1 },
      ],
      egw_collection_items: [
        { collection_id: 'collection', book_code: 'DA', puborder: 12, added_at: 1 },
      ],
    };
    const logs: string[] = [];
    const unavailableWritings = {
      query: async () => {
        throw new Error('no such table: paragraphs');
      },
    } as unknown as SqliteDatabase;

    const resolved = await resolveLegacyEgwCoordinates(snapshot, unavailableWritings, (line) =>
      logs.push(line),
    );
    const projection = makeResolvedWebStateProjection(snapshot, 'fixture', resolved);

    expect(resolved.size).toBe(0);
    expect(projection.commands).not.toContainEqual(expect.objectContaining({ source: 'egw' }));
    expect(projection.diagnostics.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(['egw_notes[0]', 'egw_markers[0]', 'egw_collection_items[0]']),
    );
    expect(projection.diagnostics.map((entry) => entry.message).join(' ')).not.toContain('Private');
    expect(logs).toEqual(['[migration] writings-resolver-unavailable coordinate=da:12']);
  });
});
