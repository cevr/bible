import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';
import { ActName } from './address-schema.ts';
import { boardNamed } from './board.ts';
import { RenderVariantName } from './catalogue.ts';
import { FootageName } from './footage.ts';
import { Segment, isSegment } from './segment.ts';
import { soundEntry } from './sfx.ts';
import { MarkName } from './talk.ts';

// Every name that is no single segment, or that a record lookup reads off
// `Object.prototype`: the four times one got through (a `..` footage name, a
// take keyed `__proto__`, a mark named `__proto__`, a `.` film) and their kin.
const NOT_SEGMENTS = ['', '.', '..', '__proto__', 'constructor', 'prototype', 'a/b', 'a\\b', '/'];

describe('Segment', () => {
  test.each(NOT_SEGMENTS)('%p is no segment', (name) => {
    expect(isSegment(name)).toBe(false);
    expect(Option.isNone(Schema.decodeOption(Segment)(name))).toBe(true);
  });

  test('a plain name is one', () => {
    expect(Schema.decodeOption(Segment)('cold open')).toEqual(
      Option.some(Segment.make('cold open')),
    );
  });

  // Each name schema is `Segment.check(…)`: one its own pattern lets through
  // (`constructor` is lower-case letters) the segment refuses.
  test.each([
    ['a board name', (name: string) => boardNamed(name)],
    ['an act', (name: string) => Schema.decodeOption(ActName)(name)],
    ['a mark', Schema.decodeOption(MarkName)],
    ['a footage name', Schema.decodeOption(FootageName)],
    ['a render variant', Schema.decodeOption(RenderVariantName)],
  ] as const)('%s is never constructor, prototype or __proto__', (_, decode) => {
    for (const name of ['constructor', 'prototype', '__proto__'])
      expect(Option.isNone(decode(name))).toBe(true);
  });

  test("a sound named constructor reads no entry off the library's prototype", () => {
    expect(Option.isNone(soundEntry({}, 'constructor'))).toBe(true);
  });
});
