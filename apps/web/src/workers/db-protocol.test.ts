import { describe, expect, test } from 'bun:test';

import { decodeWorkerRequest, decodeWorkerResponse } from './db-protocol';

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
});
