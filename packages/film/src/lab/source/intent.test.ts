// The Source face's intent: settled on the selection's line once a read names
// it while the view follows; dropped once the view no longer follows or
// another thing is selected; kept while the open is still landing.

import { describe, expect, test } from 'bun:test';
import { Equal, Option } from 'effect';
import { cueOf } from '../../command/selection.ts';
import { newestAsked } from '../../core/asked.ts';
import { FaceIntent, intentOf } from './intent.ts';

const fall = cueOf('one', 'fall');
const asked = (seen: boolean) => Option.some({ selection: fall, seen, ask: newestAsked().ask() });
const now = (o: { following: boolean; line?: number; selected?: boolean }) => ({
  selection: Option.filter(Option.some(fall), () => o.selected ?? true),
  following: o.following,
  lineOf: () => Option.fromUndefinedOr(o.line),
});

describe('the Source face’s intent', () => {
  test('nothing asked is Idle', () => {
    expect(intentOf(Option.none(), now({ following: true }))).toStrictEqual(FaceIntent.Idle());
  });

  test('following, it waits for the line, then settles on it', () => {
    expect(intentOf(asked(true), now({ following: true }))).toStrictEqual(FaceIntent.Waiting());
    expect(intentOf(asked(true), now({ following: true, line: 6 }))).toStrictEqual(
      FaceIntent.Ready({ line: 6 }),
    );
  });

  test('the open still landing (the view not yet seen following) is Opening, not moved on', () => {
    expect(intentOf(asked(false), now({ following: false, line: 6 }))).toStrictEqual(
      FaceIntent.Opening(),
    );
  });

  test('once seen following, a view that no longer follows (a hand’s scroll) has moved on, line or not', () => {
    expect(intentOf(asked(true), now({ following: false, line: 6 }))).toStrictEqual(
      FaceIntent.Gone(),
    );
  });

  test('another selection has moved on', () => {
    expect(intentOf(asked(true), now({ following: true, line: 6, selected: false }))).toStrictEqual(
      FaceIntent.Gone(),
    );
  });

  test('two readings of one state are equal, so the view settles once', () => {
    expect(
      Equal.equals(
        intentOf(asked(true), now({ following: true, line: 6 })),
        intentOf(asked(true), now({ following: true, line: 6 })),
      ),
    ).toBe(true);
  });
});

describe('the settle, ordered against a hand', () => {
  test('a line landing after a hand scrolled settles nothing: the hand asked after the open, and showed first', () => {
    const place = newestAsked();
    const settled: Array<number> = [];
    // The face opens before its line is known: it asks where the view stands.
    const open = place.ask();
    // A hand scrolls the view before the read names the line: asked and shown at once.
    expect(place.ask().answer(() => {})).toBe(true);
    // The read lands: the open's answer is older than the hand's, and shows nothing.
    expect(open.answer(() => settled.push(6))).toBe(false);
    expect(settled).toEqual([]);
  });

  test('with no hand between, the line landing settles the view', () => {
    const place = newestAsked();
    const settled: Array<number> = [];
    const open = place.ask();
    expect(open.answer(() => settled.push(6))).toBe(true);
    expect(settled).toEqual([6]);
  });
});
