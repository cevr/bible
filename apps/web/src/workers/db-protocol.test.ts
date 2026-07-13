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

  test('rejects malformed responses before resolving a caller', () => {
    expect(() => decodeWorkerResponse({ type: 'query-result', id: 1, rows: 'not rows' })).toThrow();
  });

  test('preserves transferable database exports', () => {
    const data = new ArrayBuffer(8);
    expect(decodeWorkerResponse({ type: 'export-state-result', data })).toEqual({
      type: 'export-state-result',
      data,
    });
  });

  test('decodes query rows against the caller-owned contract', () => {
    const VerseRow = Schema.Struct({ book: Schema.Number, text: Schema.String });
    expect(decodeQueryRows(VerseRow, [{ book: 1, text: 'In the beginning' }])).toEqual([
      { book: 1, text: 'In the beginning' },
    ]);
    expect(() => decodeQueryRows(VerseRow, [{ book: 'Genesis', text: 1 }])).toThrow();
  });
});
