import { describe, expect, it } from 'bun:test';

import { pinnedAt, topicStarts } from './pin';
import { rowsOf } from './rows';

const hymn = (number: number, topic: string) => ({ number, topic });

// Two topics of two hymns, then one of one: topic rows 36 tall, hymn rows 44, under a 100 pt header.
const { rows } = rowsOf([hymn(1, 'a'), hymn(2, 'a'), hymn(3, 'b'), hymn(4, 'b'), hymn(5, 'c')]);
const size = (kind: 'topic' | 'shelf' | 'hymn') => ({ topic: 36, shelf: 36, hymn: 44 })[kind];
const starts = topicStarts(rows, 100, size);

describe('the pinned topic row', () => {
  it('places each topic row below the header and every row above it', () => {
    expect(starts).toEqual([100, 100 + 36 + 88, 100 + 2 * (36 + 88)]);
  });

  it('pins nothing while the first topic is below the list top', () => {
    expect(pinnedAt(starts, 0, 36).index).toBe(-1);
    expect(pinnedAt(starts, 99.5, 36).index).toBe(-1);
  });

  it('rests the topic whose rows pass under the list top at the top', () => {
    expect(pinnedAt(starts, 100, 36)).toEqual({ index: 0, y: 0 });
    expect(pinnedAt(starts, 150, 36)).toEqual({ index: 0, y: 0 });
    expect(pinnedAt(starts, 224, 36)).toEqual({ index: 1, y: 0 });
  });

  it('lets the next topic push the pinned row up by as much as it overlaps', () => {
    // The next topic's top is 10 pt below the list top: the pinned row sits 26 pt up.
    expect(pinnedAt(starts, 214, 36)).toEqual({ index: 0, y: -26 });
    // Exactly one row below the top: no push yet.
    expect(pinnedAt(starts, 188, 36)).toEqual({ index: 0, y: 0 });
  });

  it('never pushes the last topic', () => {
    expect(pinnedAt(starts, 10_000, 36)).toEqual({ index: 2, y: 0 });
  });
});

describe('a shelf above the topics', () => {
  it('is no pinned row: the first topic starts below its header and its hymns, and nothing pins until it reaches the top', () => {
    const shelved = rowsOf(
      [hymn(1, 'a'), hymn(2, 'b')],
      [{ name: 'Recent', hymns: [hymn(2, 'b'), hymn(1, 'a')], href: '/recent' }],
    );
    const at = topicStarts(shelved.rows, 100, size);
    expect(at).toEqual([100 + 36 + 88, 100 + 36 + 88 + 36 + 44]);
    expect(pinnedAt(at, 150, 36).index).toBe(-1);
    expect(pinnedAt(at, 224, 36)).toEqual({ index: 0, y: 0 });
  });
});
