// Show only… `?only=` names one state a page shows its points in
// (out of date, awaiting approval, with comments); any other text shows
// every point. A point awaits approval by its picked variants, or by every
// variant while none is picked.

import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';
import { ChoicePoint, onlyOf, pointShows, shownIn } from './choice.ts';

interface VariantWire {
  readonly id: string;
  readonly state?: 'current' | 'stale' | 'missing';
  readonly picked?: boolean;
  readonly approval?: 'none' | 'approved' | 'stale';
  readonly comments?: number;
}

const comment = {
  id: 'c1',
  address: { _tag: 'Film' },
  variant: 'a',
  key: 'k',
  text: 'louder',
  at: 0,
  onThis: true,
};

const variant = (v: VariantWire) => ({
  id: v.id,
  label: v.id,
  lines: [],
  state: v.state ?? 'current',
  picked: v.picked ?? false,
  verbs: [],
  media: { _tag: 'Unseen' },
  key: v.id,
  approval: v.approval ?? 'none',
  comments: Array.from({ length: v.comments ?? 0 }, () => comment),
});

const point = (...variants: ReadonlyArray<VariantWire>): ChoicePoint =>
  Schema.decodeUnknownSync(ChoicePoint)({
    id: 'score',
    kind: 'score',
    title: 'score',
    lines: [],
    start: 0,
    marks: [],
    variants: variants.map(variant),
  });

describe('Show only…', () => {
  test('?only= names a state, and any other text names none', () => {
    expect(onlyOf('stale')).toEqual(Option.some('stale'));
    expect(onlyOf('comments')).toEqual(Option.some('comments'));
    expect(onlyOf('')).toEqual(Option.none());
    expect(onlyOf('everything')).toEqual(Option.none());
  });

  test('out of date: a point with a stale variant', () => {
    expect(pointShows(point({ id: 'a' }, { id: 'b', state: 'stale' }), 'stale')).toBe(true);
    expect(pointShows(point({ id: 'a' }, { id: 'b', state: 'missing' }), 'stale')).toBe(false);
  });

  test('awaiting approval: judged by the picked variant, else by every variant', () => {
    const picked = point({ id: 'a', picked: true, approval: 'approved' }, { id: 'b' });
    expect(pointShows(picked, 'unapproved')).toBe(false);
    const pickedStale = point({ id: 'a', picked: true, approval: 'stale' }, { id: 'b' });
    expect(pointShows(pickedStale, 'unapproved')).toBe(true);
    const nonePicked = point({ id: 'a', approval: 'approved' }, { id: 'b' });
    expect(pointShows(nonePicked, 'unapproved')).toBe(true);
  });

  test('with comments: a point any variant of which was commented on', () => {
    expect(pointShows(point({ id: 'a' }, { id: 'b', comments: 1 }), 'comments')).toBe(true);
    expect(pointShows(point({ id: 'a' }), 'comments')).toBe(false);
  });

  test('every point shows while the page shows them all', () => {
    const plain = point({ id: 'a', picked: true, approval: 'approved' });
    expect(shownIn(Option.none())(plain)).toBe(true);
    expect(shownIn(Option.some('stale'))(plain)).toBe(false);
  });
});
