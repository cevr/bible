import { describe, expect, it } from 'bun:test';

import { endSpace } from './end';

describe('the list end space', () => {
  it.each([0, 21, 34])('keeps at least 24 pt over a bottom inset of %d pt', (bottom) => {
    expect(endSpace(bottom)).toBeGreaterThanOrEqual(bottom + 24);
  });

  it('grows with the inset, point for point', () => {
    expect(endSpace(34) - endSpace(0)).toBe(34);
  });
});
