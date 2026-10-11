// The Source face's intent: settled on the selection's line once a read names
// it while the view follows; dropped once the view no longer follows or
// another thing is selected; kept while the open is still landing.

import { describe, expect, test } from 'bun:test';
import { Equal, Option } from 'effect';
import { cueOf } from '../../command/selection.ts';
import { FaceIntent, intentOf } from './intent.ts';

const fall = cueOf('one', 'fall');
const asked = (seen: boolean) => Option.some({ selection: fall, seen });
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
