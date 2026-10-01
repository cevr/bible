// A choice point read off the wire: its ref and its kind both come from its
// id, so a `kind` that disagrees with the id never reaches a verb or a card.

import { describe, expect, test } from 'bun:test';
import { Result, Schema } from 'effect';
import { ChoicePoint } from './choice.ts';

/** A point as the wire carries it, with the kind it claims. */
const wire = (id: string, kind: string) => ({
  id,
  kind,
  title: 't',
  lines: [],
  start: 0,
  marks: [],
  variants: [],
});

const decoded = Schema.decodeUnknownResult(ChoicePoint);

describe('a choice point on the wire', () => {
  test('its kind is the one its id names, whatever the wire claims', () => {
    const point = decoded(wire('take:paper.slide', 'render'));
    expect(Result.map(point, (p) => [p.ref._tag, p.kind])).toEqual(
      Result.succeed(['Take', 'take']),
    );
  });

  test('a montage clip is a render', () => {
    const point = decoded(wire('render:p6-onset-roof', 'score'));
    expect(Result.map(point, (p) => [p.ref._tag, p.kind])).toEqual(
      Result.succeed(['Montage', 'render']),
    );
  });

  test('an id that is no point is refused, naming it', () => {
    const point = decoded(wire('render:scenes:a,', 'render'));
    expect(Result.isFailure(point)).toBe(true);
    expect(String(Result.merge(point))).toContain('no choice point is "render:scenes:a,"');
  });
});
