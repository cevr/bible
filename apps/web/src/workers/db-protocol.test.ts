import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';

import { decodeWorkerRequest, decodeWorkerResponse } from './db-protocol';
import { decodeQueryRows } from './db-client';

describe('database worker protocol', () => {
  test('accepts a complete typed query request', () => {
    expect(
      decodeWorkerRequest({
        type: 'query',
        id: 1,
        db: 'bible',
        sql: 'SELECT 1',
        params: [1, 'Genesis'],
      }),
    ).toEqual({
      type: 'query',
      id: 1,
      db: 'bible',
      sql: 'SELECT 1',
      params: [1, 'Genesis'],
    });
  });

  test('rejects malformed requests before worker dispatch', () => {
    expect(() => decodeWorkerRequest({ type: 'query', id: 0, db: 'secrets', sql: '' })).toThrow();
  });

  test('requires a positive correlation id on every request variant', () => {
    const requestsWithoutIds = [
      { type: 'init' },
      { type: 'query', db: 'bible', sql: 'SELECT 1' },
      { type: 'exec', db: 'state', sql: 'DELETE FROM annotations' },
      { type: 'export-state' },
      { type: 'is-dirty' },
      { type: 'sync-book', bookCode: '1BC' },
      { type: 'get-egw-sync-status' },
      { type: 'sync-full-egw' },
      { type: 'init-topics' },
    ];

    for (const request of requestsWithoutIds) {
      expect(() => decodeWorkerRequest(request)).toThrow();
    }
  });

  test('rejects malformed responses before resolving a caller', () => {
    expect(() => decodeWorkerResponse({ type: 'query-result', id: 1, rows: 'not rows' })).toThrow();
  });

  test('preserves transferable database exports', () => {
    const data = new ArrayBuffer(8);
    expect(decodeWorkerResponse({ type: 'export-state-result', id: 7, data })).toEqual({
      type: 'export-state-result',
      id: 7,
      data,
    });
  });

  test('preserves distinct correlation ids across terminal operations', () => {
    const data = new ArrayBuffer(8);
    const responses = [
      { type: 'init-complete', id: 11 },
      { type: 'query-result', id: 12, rows: [] },
      { type: 'exec-result', id: 13, changes: 1 },
      { type: 'export-state-result', id: 14, data },
      { type: 'is-dirty-result', id: 15, dirty: false },
      { type: 'sync-book-result', id: 16, bookCode: '1BC', paragraphCount: 10 },
      { type: 'egw-sync-status-result', id: 17, books: [] },
      { type: 'sync-full-egw-result', id: 18 },
      { type: 'init-topics-complete', id: 19 },
    ] as const;

    expect(responses.map((response) => decodeWorkerResponse(response).id)).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);
  });

  test('decodes query rows against the caller-owned contract', () => {
    const VerseRow = Schema.Struct({ book: Schema.Number, text: Schema.String });
    expect(decodeQueryRows(VerseRow, [{ book: 1, text: 'In the beginning' }])).toEqual([
      { book: 1, text: 'In the beginning' },
    ]);
    expect(() => decodeQueryRows(VerseRow, [{ book: 'Genesis', text: 1 }])).toThrow();
  });
});
