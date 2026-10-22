/**
 * Which hymn the bottom bar acts on, over every case of the player: on a
 * hymn page the page's hymn, unless another hymn sounds; off a page, the
 * held hymn, or nothing.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { Bar, barFor, playedShare, stackBottom, toldPlace } from './bar';
import { Player, type Track } from './player';

const three: Track = { number: 3, title: 'Three' };
const four: Track = { number: 4, title: 'Four' };
const length = Option.some(120);

/** Every state of the player holding `track`. */
const holding = (track: Track) => ({
  Loading: Player.Loading({ track }),
  Playing: Player.Playing({ track, at: 30, length }),
  Buffering: Player.Buffering({ track, at: 30, length, retry: false }),
  Paused: Player.Paused({ track, at: 30, length }),
  Ended: Player.Ended({ track, length }),
  Stopped: Player.Stopped({ track, at: Option.none() }),
  Failed: Player.Failed({ track, offline: true, at: Option.none() }),
});

describe('barFor', () => {
  it('shows nothing off a hymn page while the player holds no hymn', () => {
    expect(barFor(Player.Idle(), Option.none())).toEqual(Bar.Hidden());
  });

  it('shows the held hymn off a hymn page, in every state', () => {
    for (const state of Object.values(holding(three)))
      expect(barFor(state, Option.none())).toEqual(
        Bar.Shown({ track: three, state, page: Option.none() }),
      );
  });

  it("acts on the page's hymn while the player holds nothing", () => {
    expect(barFor(Player.Idle(), Option.some(four))).toEqual(
      Bar.Shown({ track: four, state: Player.Idle(), page: Option.none() }),
    );
  });

  it("acts on the page's hymn in every state the player holds it in", () => {
    for (const state of Object.values(holding(four)))
      expect(barFor(state, Option.some(four))).toEqual(
        Bar.Shown({ track: four, state, page: Option.none() }),
      );
  });

  it('shows another hymn that sounds, with the page hymn beside it', () => {
    const { Loading, Playing, Buffering } = holding(three);
    for (const state of [Loading, Playing, Buffering])
      expect(barFor(state, Option.some(four))).toEqual(
        Bar.Shown({ track: three, state, page: Option.some(four) }),
      );
  });

  it("gives a held hymn that does not sound way to the page's hymn", () => {
    const { Paused, Ended, Stopped, Failed } = holding(three);
    for (const state of [Paused, Ended, Stopped, Failed])
      expect(barFor(state, Option.some(four))).toEqual(
        Bar.Shown({ track: four, state: Player.Idle(), page: Option.none() }),
      );
  });
});

describe('the seek line', () => {
  it('fills the share played while the length is known, and nothing before', () => {
    const track = three;
    expect(playedShare(Player.Playing({ track, at: 30, length }))).toBe(0.25);
    expect(playedShare(Player.Paused({ track, at: 90, length }))).toBe(0.75);
    expect(playedShare(Player.Ended({ track, length }))).toBe(1);
    expect(playedShare(Player.Playing({ track, at: 30, length: Option.none() }))).toBe(0);
    expect(playedShare(Player.Playing({ track, at: 130, length }))).toBe(1);
    expect(playedShare(Player.Idle())).toBe(0);
    expect(playedShare(Player.Loading({ track }))).toBe(0);
    expect(playedShare(Player.Stopped({ track, at: Option.some(30) }))).toBe(0);
  });

  it('says the time gone and the length while both are known', () => {
    expect(toldPlace(Player.Playing({ track: three, at: 30, length }))).toEqual(
      Option.some('0:30 of 2:00'),
    );
    expect(toldPlace(Player.Playing({ track: three, at: 30, length: Option.none() }))).toEqual(
      Option.none(),
    );
    expect(toldPlace(Player.Idle())).toEqual(Option.none());
  });
});

describe('stackBottom', () => {
  it('leaves the stack the device inset while the bar is hidden', () => {
    expect(stackBottom(Bar.Hidden(), 34)).toBe(34);
    expect(stackBottom(Bar.Hidden(), -1)).toBe(0);
  });

  it('leaves none while the bar shows: the bar holds the home indicator', () => {
    for (const state of Object.values(holding(three))) {
      expect(stackBottom(barFor(state, Option.none()), 34)).toBe(0);
    }
    expect(stackBottom(barFor(Player.Idle(), Option.some(four)), 34)).toBe(0);
  });
});
