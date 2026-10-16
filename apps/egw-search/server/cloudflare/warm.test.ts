import { describe, expect, test } from 'bun:test';

import { EMPTY_PARAMS, toRequest } from '../../src/url-state.js';
import { EXAMPLE_QUERIES, PAGE_CONTEXT } from '../api.js';
import { warmRequest } from './warm.ts';

const MINUTE = 60_000;

describe("the search's warm-up", () => {
  test('consecutive minutes run every example in turn', () => {
    const start = 29_000_000 * MINUTE;
    const run = EXAMPLE_QUERIES.map((_, minute) => warmRequest(start + minute * MINUTE).q);
    expect(new Set(run)).toEqual(new Set(EXAMPLE_QUERIES));
    expect(warmRequest(start + EXAMPLE_QUERIES.length * MINUTE).q).toBe(warmRequest(start).q);
  });

  test('a fire runs the request the empty page sends when its example is clicked', () => {
    for (const [minute, q] of EXAMPLE_QUERIES.entries()) {
      expect(warmRequest(minute * MINUTE + 59_999)).toEqual(
        toRequest({ ...EMPTY_PARAMS, q }, PAGE_CONTEXT),
      );
    }
  });
});
