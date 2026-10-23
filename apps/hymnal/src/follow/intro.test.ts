import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import bundled from 'virtual:hymnal-timing';

import { Player } from '~/player/player';

import { introOf, readingOf } from './intro';
import { timelineOf } from './timeline';

const track = { number: 100, title: 'A' };
const length = Option.none<number>();
const FIRST = 18861;
const playing = (ms: number) => Player.Playing({ track, at: ms / 1000, length });

describe('introOf', () => {
  it('gives the share played and the time left before the first line (F3a)', () => {
    expect(introOf(100, FIRST, playing(0))).toEqual(Option.some({ share: 0, left: FIRST }));
    const half = Option.getOrThrow(introOf(100, FIRST, playing(9430)));
    expect(Math.abs(half.share - 0.5)).toBeLessThan(0.001);
    expect(Option.isSome(introOf(100, FIRST, playing(18860)))).toBe(true);
    expect(introOf(100, FIRST, Player.Paused({ track, at: 5, length }))).toEqual(
      introOf(100, FIRST, playing(5000)),
    );
    expect(
      Option.isSome(introOf(100, FIRST, Player.Buffering({ track, at: 5, length, retry: false }))),
    ).toBe(true);
  });

  it('gives none from the first line on, with no intro, and in every other state', () => {
    for (const ms of [FIRST, FIRST + 1, 60_000])
      expect(introOf(100, FIRST, playing(ms))).toEqual(Option.none());
    expect(introOf(100, 0, playing(0))).toEqual(Option.none());
    const others = [
      Player.Idle(),
      Player.Loading({ track }),
      Player.Stopped({ track, at: Option.some(1) }),
      Player.Ended({ track, length }),
      Player.Failed({ track, offline: false, at: Option.none() }),
      Player.Playing({ track: { number: 7, title: 'B' }, at: 1, length }),
    ];
    for (const state of others) expect(introOf(100, FIRST, state)).toEqual(Option.none());
  });

  it('reads as whole percent played and whole seconds left', () => {
    expect(readingOf({ share: 5000 / 18928, left: 13928 })).toEqual({
      now: 26,
      text: '14 seconds to the first line',
    });
  });

  it('on every bundled timeline, lies in [0, 1), moves up with the place, and ends at the first line', () => {
    const faults: Array<string> = [];
    for (const [number, encoded] of bundled) {
      const { first } = Option.getOrThrow(timelineOf(encoded));
      const shares = [0, 0.25, 0.5, 0.99].map((part) =>
        Option.map(
          introOf(
            number,
            first,
            Player.Playing({ track: { number, title: '' }, at: (first * part) / 1000, length }),
          ),
          (i) => i.share,
        ),
      );
      const at = (ms: number) =>
        introOf(
          number,
          first,
          Player.Playing({ track: { number, title: '' }, at: ms / 1000, length }),
        );
      if (first === 0) {
        if (shares.some(Option.isSome)) faults.push(`${number}: intro with first 0`);
        continue;
      }
      const values = shares.map((s) => Option.getOrElse(s, () => -1));
      if (values.some((v) => v < 0 || v >= 1)) faults.push(`${number}: share out of range`);
      if (values.some((v, k) => k > 0 && v < (values[k - 1] ?? 0))) faults.push(`${number}: back`);
      // A ms past the first line: the player tells seconds, and `first / 1000 * 1000` may fall a hair short of it, as the follower sees it too.
      if (Option.isSome(at(first + 1))) faults.push(`${number}: intro after first`);
    }
    expect(faults).toEqual([]);
  });
});
