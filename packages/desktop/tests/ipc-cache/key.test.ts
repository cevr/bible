import { describe, expect, it } from 'vitest';
import { makeCacheKey } from '../../src/ipc-cache/key.js';

describe('makeCacheKey', () => {
  it('returns the same key for structurally equal args', () => {
    const a = makeCacheKey('egw.fetchBooks', ['en']);
    const b = makeCacheKey('egw.fetchBooks', ['en']);
    expect(a).toBe(b);
  });

  it('differs across paths even with same args', () => {
    const a = makeCacheKey('egw.fetchBooks', ['en']);
    const b = makeCacheKey('egw.fetchToc', ['en']);
    expect(a).not.toBe(b);
  });

  it('differs across arg values', () => {
    const a = makeCacheKey('egw.fetchBooks', ['en']);
    const b = makeCacheKey('egw.fetchBooks', ['de']);
    expect(a).not.toBe(b);
  });

  it('treats arg order as significant', () => {
    const a = makeCacheKey('cache.putChapter', [1, '2']);
    const b = makeCacheKey('cache.putChapter', ['2', 1]);
    expect(a).not.toBe(b);
  });

  it('encodes the path as a human-readable prefix', () => {
    const key = makeCacheKey('search.refcode', ['DAR 62', 5]);
    expect(key.startsWith('search.refcode:')).toBe(true);
  });

  it('distinguishes numbers from numeric strings', () => {
    const a = makeCacheKey('cache.get', [1]);
    const b = makeCacheKey('cache.get', ['1']);
    expect(a).not.toBe(b);
  });

  it('normalizes object key order so {a,b} and {b,a} collide intentionally', () => {
    const a = makeCacheKey('rpc.q', [{ a: 1, b: 2 }]);
    const b = makeCacheKey('rpc.q', [{ b: 2, a: 1 }]);
    expect(a).toBe(b);
  });

  it('handles nested objects with sorted keys', () => {
    const a = makeCacheKey('rpc.q', [{ outer: { x: 1, y: 2 } }]);
    const b = makeCacheKey('rpc.q', [{ outer: { y: 2, x: 1 } }]);
    expect(a).toBe(b);
  });

  it('preserves array order inside args', () => {
    const a = makeCacheKey('rpc.q', [[1, 2, 3]]);
    const b = makeCacheKey('rpc.q', [[3, 2, 1]]);
    expect(a).not.toBe(b);
  });
});
