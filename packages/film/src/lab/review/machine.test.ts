// The review's machines, with no DOM. The synced player plays and pauses,
// plays again from the start once at the end, holds while a video stalls,
// scrubs (playing on after if it was), steps inside the set, and keeps its
// rate and the sound it plays through all of it; a seek counts, a tick does
// not. The view moves between all, the pair, the moments and the notes, a
// pair keeping its other and the moments wrapping round.

import { Effect, Match, Option } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { assertPath, simulate } from 'effect-machine';
import {
  STEP_S,
  SyncEvent,
  SyncState,
  UNKNOWN_END,
  ViewEvent,
  ViewState,
  clockText,
  playsIn,
  reachOf,
  runningOf,
  spreadMoments,
  syncMachine,
  timeText,
  viewMachine,
  wrapped,
} from './machine.ts';
import { drifted } from './sync.ts';

const player = syncMachine('A', 1);

const clock = { t: 1, start: 1, end: 10, rate: 1, audible: 'A', seek: 0 } as const;

describe('the synced player', () => {
  it.effect('plays and pauses, by the button and by space', () =>
    Effect.gen(function* () {
      yield* assertPath(
        player,
        [
          SyncEvent.Measured({ end: 10 }),
          SyncEvent.PlayPressed,
          SyncEvent.PausePressed,
          SyncEvent.Toggled,
          SyncEvent.Toggled,
        ],
        ['Paused', 'Paused', 'Playing', 'Paused', 'Playing', 'Paused'],
      );
    }),
  );

  it.effect('follows the clock while playing, never past the end; a tick is no seek', () =>
    Effect.gen(function* () {
      const result = yield* simulate(player, [
        SyncEvent.Measured({ end: 10 }),
        SyncEvent.PlayPressed,
        SyncEvent.Ticked({ t: 4.2 }),
        SyncEvent.Ticked({ t: 11 }),
      ]);
      expect(result.finalState).toEqual(SyncState.Playing({ ...clock, t: 10 }));
    }),
  );

  it.effect('stops at the end, and plays again from the start', () =>
    Effect.gen(function* () {
      const result = yield* simulate(player, [
        SyncEvent.Measured({ end: 10 }),
        SyncEvent.PlayPressed,
        SyncEvent.Ticked({ t: 9.9 }),
        SyncEvent.Ended,
        SyncEvent.PlayPressed,
      ]);
      expect(result.states.at(-2)).toEqual(SyncState.Paused({ ...clock, t: 10 }));
      expect(result.finalState).toEqual(SyncState.Playing({ ...clock, t: 1, seek: 1 }));
    }),
  );

  it.effect('holds while a video stalls, and plays on once it can; a pause there pauses', () =>
    Effect.gen(function* () {
      yield* assertPath(
        player,
        [
          SyncEvent.PlayPressed,
          SyncEvent.Stalled,
          SyncEvent.Ticked({ t: 5 }),
          SyncEvent.Resumed,
          SyncEvent.Stalled,
          SyncEvent.Toggled,
          SyncEvent.Stalled,
        ],
        // A tick while it waits, and a stall once paused, change nothing.
        ['Paused', 'Playing', 'Buffering', 'Playing', 'Buffering', 'Paused'],
      );
    }),
  );

  it.effect('scrubs every video, playing on after only if it was playing', () =>
    Effect.gen(function* () {
      const paused = yield* simulate(player, [
        SyncEvent.Measured({ end: 10 }),
        SyncEvent.ScrubMoved({ t: 3 }),
        SyncEvent.ScrubMoved({ t: 20 }),
        SyncEvent.ScrubReleased,
      ]);
      expect(paused.states.slice(2).map((s) => s._tag)).toEqual([
        'Scrubbing',
        'Scrubbing',
        'Paused',
      ]);
      expect(paused.finalState).toEqual(SyncState.Paused({ ...clock, t: 10, seek: 2 }));
      const playing = yield* simulate(player, [
        SyncEvent.Measured({ end: 10 }),
        SyncEvent.PlayPressed,
        SyncEvent.ScrubMoved({ t: 0 }),
        SyncEvent.ScrubReleased,
      ]);
      expect(playing.finalState).toEqual(SyncState.Playing({ ...clock, t: 1, seek: 1 }));
    }),
  );

  it.effect('steps 2 s either way inside the set, as it stands', () =>
    Effect.gen(function* () {
      const result = yield* simulate(player, [
        SyncEvent.Measured({ end: 10 }),
        SyncEvent.Stepped({ by: STEP_S }),
        SyncEvent.Stepped({ by: STEP_S }),
        SyncEvent.PlayPressed,
        SyncEvent.Stepped({ by: -STEP_S * 4 }),
      ]);
      expect(result.states.map((s) => [s._tag, s.t, s.seek])).toEqual([
        ['Paused', 1, 0],
        ['Paused', 1, 0],
        ['Paused', 3, 1],
        ['Paused', 5, 2],
        ['Playing', 5, 2],
        ['Playing', 1, 3],
      ]);
    }),
  );

  it.effect('keeps the sound heard and the rate through play, scrub and pause', () =>
    Effect.gen(function* () {
      const result = yield* simulate(player, [
        SyncEvent.HeardChosen({ id: 'C' }),
        SyncEvent.RateChosen({ rate: 0.5 }),
        SyncEvent.PlayPressed,
        SyncEvent.ScrubMoved({ t: 2 }),
        SyncEvent.ScrubReleased,
        SyncEvent.HeardChosen({ id: 'B' }),
        SyncEvent.PausePressed,
      ]);
      expect(result.states.map((s) => [s.audible, s.rate])).toEqual([
        ['A', 1],
        ['C', 1],
        ['C', 0.5],
        ['C', 0.5],
        ['C', 0.5],
        ['C', 0.5],
        ['B', 0.5],
        ['B', 0.5],
      ]);
      expect(result.finalState._tag).toBe('Paused');
    }),
  );

  test('runs the videos only while playing', () => {
    expect(runningOf(SyncState.Playing(clock))).toBe(true);
    expect(runningOf(SyncState.Buffering(clock))).toBe(false);
    expect(runningOf(SyncState.Scrubbing({ ...clock, resume: true }))).toBe(false);
    expect(runningOf(SyncState.Paused(clock))).toBe(false);
  });

  test('says where the clock is, the end once known, and when it waits', () => {
    expect(timeText(65.24)).toBe('1:05.2');
    expect(clockText(SyncState.Paused({ ...clock, end: UNKNOWN_END }))).toBe('0:01.0 / …');
    expect(clockText(SyncState.Buffering({ ...clock, t: 4 }))).toBe('0:04.0 / 0:10.0 · waiting');
    expect(reachOf(SyncState.Paused({ ...clock, end: UNKNOWN_END }))).toBe(1);
    expect(reachOf(SyncState.Paused(clock))).toBe(10);
  });

  test('puts back a video more than 0.2 s off the clock, and only then', () => {
    expect(drifted(5.1, 5)).toBe(false);
    expect(drifted(4.85, 5)).toBe(false);
    expect(drifted(5.25, 5)).toBe(true);
    expect(drifted(4.7, 5)).toBe(true);
  });
});

const views = viewMachine(ViewState.All, Option.some('B'));

describe('the view', () => {
  it.effect('moves between all, the pair, the moments and the notes', () =>
    Effect.gen(function* () {
      yield* assertPath(
        views,
        [
          ViewEvent.ViewChosen({ view: 'pair' }),
          ViewEvent.ViewChosen({ view: 'moments' }),
          ViewEvent.ViewChosen({ view: 'notes' }),
          ViewEvent.ViewChosen({ view: 'all' }),
        ],
        ['All', 'Pair', 'Moments', 'Notes', 'All'],
      );
    }),
  );

  it.effect('a pair starts on the second variant and keeps the other chosen', () =>
    Effect.gen(function* () {
      const result = yield* simulate(views, [
        ViewEvent.ViewChosen({ view: 'pair' }),
        ViewEvent.OtherChosen({ id: 'D' }),
        ViewEvent.ViewChosen({ view: 'pair' }),
        ViewEvent.OtherChosen({ id: 'C' }),
      ]);
      expect(result.states.slice(1)).toEqual([
        ViewState.Pair({ other: 'B' }),
        ViewState.Pair({ other: 'D' }),
        ViewState.Pair({ other: 'D' }),
        ViewState.Pair({ other: 'C' }),
      ]);
    }),
  );

  it.effect('the moments start on the first, and ←/→ wrap round them', () =>
    Effect.gen(function* () {
      const result = yield* simulate(views, [
        ViewEvent.ViewChosen({ view: 'moments' }),
        ViewEvent.MomentStepped({ by: -1, count: 5 }),
        ViewEvent.MomentStepped({ by: 1, count: 5 }),
        ViewEvent.MomentStepped({ by: 1, count: 5 }),
        ViewEvent.MomentChosen({ index: 3 }),
      ]);
      const index = (s: ViewState) =>
        Match.value(s).pipe(
          Match.tag('Moments', (m) => m.index),
          Match.orElse(() => -1),
        );
      expect(result.states.slice(1).map(index)).toEqual([0, 4, 0, 1, 3]);
    }),
  );

  it.effect('a set of one version has no side by side: a link to it opens All', () =>
    Effect.gen(function* () {
      const one = viewMachine(ViewState.Pair({ other: '' }), Option.none());
      yield* assertPath(
        one,
        [
          ViewEvent.ViewChosen({ view: 'pair' }),
          ViewEvent.ViewChosen({ view: 'moments' }),
          ViewEvent.ViewChosen({ view: 'pair' }),
        ],
        ['All', 'All', 'Moments', 'Moments'],
      );
    }),
  );

  it.effect('an other or a moment means nothing outside its view', () =>
    Effect.gen(function* () {
      yield* assertPath(
        views,
        [ViewEvent.OtherChosen({ id: 'C' }), ViewEvent.MomentChosen({ index: 2 })],
        ['All'],
      );
    }),
  );

  test('plays videos in all and the pair only', () => {
    expect([playsIn('all'), playsIn('pair'), playsIn('moments'), playsIn('notes')]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  test('five moments spread over the first video, none before the start', () => {
    expect(spreadMoments(20, 0)).toEqual([1, 5, 10, 15, 19]);
    expect(spreadMoments(20, 3)).toEqual([3, 5, 10, 15, 19]);
    expect(wrapped(0, -1, 0)).toBe(0);
  });
});
