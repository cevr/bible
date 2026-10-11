// The review's machines, with no DOM. The synced player plays and pauses,
// plays again from the start once at the end, holds while a video stalls,
// scrubs (playing on after if it was), steps inside the set, and keeps its
// rate and the sound it plays through all of it; a seek counts, a tick does
// not. The view moves between all, the pair, the moments and the difference, a
// pair keeping its other and the moments wrapping round.

import { Effect, Match, Option } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { assertPath, simulate } from 'effect-machine';
import {
  SyncEvent,
  SyncState,
  UNKNOWN_END,
  ViewEvent,
  atRest,
  ViewState,
  clockParts,
  modeOf,
  modeView,
  modesOf,
  nextLayout,
  nextModeView,
  playsIn,
  reachOf,
  runningOf,
  spreadMoments,
  stepView,
  syncMachine,
  viewMachine,
  wrapped,
} from './machine.ts';
import { FILM_FPS } from '../../core/time.ts';
import { PlayerKey, drifted, playerEvent } from './sync.ts';

const player = syncMachine('A', 1);

const clock = { t: 1, start: 1, end: 10, fps: FILM_FPS, rate: 1, audible: 'A', seek: 0 } as const;

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

  it.effect("opens at a link's time, never before the start, and stands at the end past it", () =>
    Effect.gen(function* () {
      expect((yield* simulate(syncMachine('A', 1, 4.5), [])).finalState).toEqual(
        SyncState.Paused({ ...clock, t: 4.5, end: UNKNOWN_END }),
      );
      expect((yield* simulate(syncMachine('A', 1, -3), [])).finalState.t).toBe(1);
      const past = yield* simulate(syncMachine('A', 1, 30), [SyncEvent.Measured({ end: 10 })]);
      expect(past.finalState).toEqual(SyncState.Paused({ ...clock, t: 10 }));
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

  it.effect(
    'steps one frame of the clock either way inside the set, as it stands, onto the frame grid',
    () =>
      Effect.gen(function* () {
        const step = (by: number) => playerEvent(PlayerKey.Step({ by }));
        const frameOf = (t: number) => Math.round(t * FILM_FPS * 1e6) / 1e6;
        const result = yield* simulate(player, [
          SyncEvent.Measured({ end: 10 }),
          // A clock between frames (a video's time) steps from the frame its timecode reads.
          SyncEvent.Landed({ t: 1.0101 }),
          step(1),
          step(10),
          SyncEvent.PlayPressed,
          step(-1),
          step(-100),
        ]);
        expect(result.states.map((s) => [s._tag, frameOf(s.t), s.seek])).toEqual([
          ['Paused', 30, 0],
          ['Paused', 30, 0],
          ['Paused', 30.303, 1],
          ['Paused', 31, 2],
          ['Paused', 41, 3],
          ['Playing', 41, 3],
          ['Playing', 40, 4],
          // Never before the set's start.
          ['Playing', 30, 5],
        ]);
        // On the grid: ten single steps land where one ×10 does, with no drift.
        const tens = yield* simulate(player, [
          SyncEvent.Measured({ end: 10 }),
          ...Array.from({ length: 10 }, () => step(1)),
        ]);
        expect(tens.finalState.t).toBe(40 / FILM_FPS);
      }),
  );

  it.effect(
    "steps and counts by the clock's video's own rate once it is known, the film rate until then",
    () =>
      Effect.gen(function* () {
        const step = playerEvent(PlayerKey.Step({ by: 1 }));
        const result = yield* simulate(player, [
          SyncEvent.Measured({ end: 10 }),
          step,
          SyncEvent.Timed({ fps: 24 }),
          step,
          step,
        ]);
        // At the film rate (30): frame 31; at 24, from the frame it reads (24.8, so 25) on.
        expect(result.states.map((s) => [s.fps, s.t])).toEqual([
          [FILM_FPS, 1],
          [FILM_FPS, 1],
          [FILM_FPS, 31 / 30],
          [24, 31 / 30],
          [24, 26 / 24],
          [24, 27 / 24],
        ]);
        expect(clockParts(result.finalState)).toEqual({
          at: '00:00:01:03',
          rest: ' / 00:00:10:00',
        });
      }),
  );

  it.effect('steps a 29.97 video (30000/1001) on its own grid, never a whole rate', () =>
    Effect.gen(function* () {
      const fps = 30000 / 1001;
      const step = playerEvent(PlayerKey.Step({ by: 1 }));
      const result = yield* simulate(player, [
        SyncEvent.Measured({ end: 60 }),
        SyncEvent.Timed({ fps }),
        SyncEvent.Landed({ t: 30 / fps }),
        step,
        SyncEvent.Landed({ t: 1000 / fps }),
        step,
        step,
      ]);
      // Each step lands on a frame's own start: n of 30000/1001, the picture's time.
      const frames = result.states.slice(-5).map((s) => Math.round(s.t * 30000) / 1001);
      expect(frames).toEqual([30, 31, 1000, 1001, 1002]);
      expect(clockParts(result.finalState).at).toBe('00:00:33:12');
    }),
  );

  it.effect('Back landing on an entry seeks to its time, playing on as it was', () =>
    Effect.gen(function* () {
      const result = yield* simulate(player, [
        SyncEvent.Measured({ end: 10 }),
        SyncEvent.Landed({ t: 4 }),
        SyncEvent.PlayPressed,
        SyncEvent.Landed({ t: 20 }),
      ]);
      expect(result.states.map((s) => [s._tag, s.t, s.seek])).toEqual([
        ['Paused', 1, 0],
        ['Paused', 1, 0],
        ['Paused', 4, 1],
        ['Playing', 4, 1],
        ['Playing', 10, 2],
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

  it.effect('fails where it stands once its media cannot play, and stays failed', () =>
    Effect.gen(function* () {
      const result = yield* simulate(player, [
        SyncEvent.Measured({ end: 10 }),
        SyncEvent.PlayPressed,
        SyncEvent.Ticked({ t: 3 }),
        SyncEvent.MediaFailed({ reason: 'NotSupportedError' }),
        SyncEvent.Toggled,
        SyncEvent.ScrubMoved({ t: 5 }),
        SyncEvent.Stepped({ frames: 1 }),
      ]);
      expect(result.finalState).toEqual(
        SyncState.Failed({ ...clock, t: 3, reason: 'NotSupportedError' }),
      );
      expect(runningOf(result.finalState)).toBe(false);
    }),
  );

  it.effect(
    'given new media after failing, stands paused where it failed; playing, new media changes nothing',
    () =>
      Effect.gen(function* () {
        const result = yield* simulate(player, [
          SyncEvent.Measured({ end: 10 }),
          SyncEvent.PlayPressed,
          SyncEvent.Ticked({ t: 3 }),
          SyncEvent.MediaReplaced,
          SyncEvent.MediaFailed({ reason: 'error' }),
          SyncEvent.MediaReplaced,
        ]);
        expect(result.states.map((s) => s._tag)).toEqual([
          'Paused',
          'Paused',
          'Playing',
          'Playing',
          'Failed',
          'Paused',
        ]);
        expect(result.finalState).toEqual(SyncState.Paused({ ...clock, t: 3 }));
      }),
  );

  it.effect(
    "on a clock moved to another video, ends at that one's end, unknown until measured; a failed clock's player stands paused",
    () =>
      Effect.gen(function* () {
        const result = yield* simulate(player, [
          SyncEvent.Measured({ end: 10 }),
          SyncEvent.PlayPressed,
          SyncEvent.Ticked({ t: 8 }),
          SyncEvent.ClockMoved({ end: 3 }),
          SyncEvent.ClockMoved({ end: UNKNOWN_END }),
          SyncEvent.MediaFailed({ reason: 'error' }),
          SyncEvent.ClockMoved({ end: 6 }),
        ]);
        expect(result.states.map((s) => [s._tag, s.t, s.end])).toEqual([
          ['Paused', 1, UNKNOWN_END],
          ['Paused', 1, 10],
          ['Playing', 1, 10],
          ['Playing', 8, 10],
          ['Playing', 3, 3],
          ['Playing', 3, UNKNOWN_END],
          ['Failed', 3, UNKNOWN_END],
          ['Paused', 3, 6],
        ]);
      }),
  );

  test('is at rest only paused where it opens: a scrub, even back to the start, is not', () => {
    expect(atRest(SyncState.Paused(clock))).toBe(true);
    expect(atRest(SyncState.Paused({ ...clock, t: 2 }))).toBe(false);
    expect(atRest(SyncState.Scrubbing({ ...clock, resume: false }))).toBe(false);
    expect(atRest(SyncState.Playing(clock))).toBe(false);
    expect(atRest(SyncState.Buffering(clock))).toBe(false);
    expect(atRest(SyncState.Failed({ ...clock, reason: 'NotSupportedError' }))).toBe(false);
  });

  test('runs the videos only while playing', () => {
    expect(runningOf(SyncState.Playing(clock))).toBe(true);
    expect(runningOf(SyncState.Buffering(clock))).toBe(false);
    expect(runningOf(SyncState.Scrubbing({ ...clock, resume: true }))).toBe(false);
    expect(runningOf(SyncState.Paused(clock))).toBe(false);
  });

  test('says where the clock is, the end once known, and when it waits', () => {
    expect(clockParts(SyncState.Paused({ ...clock, end: UNKNOWN_END }))).toEqual({
      at: '00:00:01:00',
      rest: ' / …',
    });
    expect(clockParts(SyncState.Buffering({ ...clock, t: 4 }))).toEqual({
      at: '00:00:04:00',
      rest: ' / 00:00:10:00 · waiting',
    });
    expect(clockParts(SyncState.Paused({ ...clock, t: 65.24, end: 70 }))).toEqual({
      at: '00:01:05:07',
      rest: ' / 00:01:10:00',
    });
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
  it.effect('moves between all, the pair, the moments and the difference', () =>
    Effect.gen(function* () {
      yield* assertPath(
        views,
        [
          ViewEvent.ViewChosen({ view: 'pair' }),
          ViewEvent.ViewChosen({ view: 'moments' }),
          ViewEvent.ViewChosen({ view: 'diff' }),
          ViewEvent.ViewChosen({ view: 'all' }),
        ],
        ['All', 'Pair', 'Moments', 'Diff', 'All'],
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

  test('one event steps the view the URL holds to the next', () => {
    const b = Option.some('B');
    expect(stepView(ViewState.All, b, ViewEvent.ViewChosen({ view: 'pair' }))).toEqual(
      ViewState.Pair({ other: 'B' }),
    );
    expect(
      stepView(ViewState.Moments({ index: 4 }), b, ViewEvent.MomentStepped({ by: 1, count: 5 })),
    ).toEqual(ViewState.Moments({ index: 0 }));
    expect(stepView(ViewState.All, Option.none(), ViewEvent.ViewChosen({ view: 'pair' }))).toEqual(
      ViewState.All,
    );
  });

  test("a set's modes: All, Compare (its layouts the pair, the wipe and the difference) and Moments (UR-21)", () => {
    expect([
      modeOf('all'),
      modeOf('pair'),
      modeOf('wipe'),
      modeOf('diff'),
      modeOf('moments'),
    ]).toEqual(['all', 'compare', 'compare', 'compare', 'moments']);
    expect(modesOf(1)).toEqual(['all', 'moments']);
    expect(modesOf(3)).toEqual(['all', 'compare', 'moments']);
    // `v` steps the modes round, each opening on its first view; a set of one skips Compare.
    expect(nextModeView('all', modesOf(3))).toBe('pair');
    expect(nextModeView('wipe', modesOf(3))).toBe('moments');
    expect(nextModeView('moments', modesOf(3))).toBe('all');
    expect(nextModeView('all', modesOf(1))).toBe('moments');
    // A mode tapped again keeps its layout.
    expect(modeView('compare', 'diff')).toBe('diff');
    expect(modeView('compare', 'all')).toBe('pair');
    // `⇧V` steps Compare's layouts round, and nothing outside it.
    expect([nextLayout('pair'), nextLayout('wipe'), nextLayout('diff')]).toEqual([
      Option.some('wipe'),
      Option.some('diff'),
      Option.some('pair'),
    ]);
    expect(nextLayout('all')).toEqual(Option.none());
  });

  test('plays videos in all, the pair and its wipe; the moments and the difference stand still', () => {
    expect([
      playsIn('all'),
      playsIn('pair'),
      playsIn('wipe'),
      playsIn('moments'),
      playsIn('diff'),
    ]).toEqual([true, true, true, false, false]);
  });
});

describe('the wipe and the difference (PA-8)', () => {
  it.effect('the pair, its wipe and its difference share the other chosen', () =>
    Effect.gen(function* () {
      const result = yield* simulate(views, [
        ViewEvent.ViewChosen({ view: 'wipe' }),
        ViewEvent.OtherChosen({ id: 'C' }),
        ViewEvent.ViewChosen({ view: 'diff' }),
        ViewEvent.OtherChosen({ id: 'D' }),
        ViewEvent.ViewChosen({ view: 'pair' }),
      ]);
      expect(result.states.slice(1)).toEqual([
        ViewState.Wipe({ other: 'B' }),
        ViewState.Wipe({ other: 'C' }),
        ViewState.Diff({ other: 'C', index: 0 }),
        ViewState.Diff({ other: 'D', index: 0 }),
        ViewState.Pair({ other: 'D' }),
      ]);
    }),
  );

  it.effect(
    'the difference is of the moments: ←/→ and a moment chosen move it, keeping the other',
    () =>
      Effect.gen(function* () {
        const result = yield* simulate(views, [
          ViewEvent.ViewChosen({ view: 'diff' }),
          ViewEvent.MomentStepped({ by: -1, count: 5 }),
          ViewEvent.MomentChosen({ index: 2 }),
          ViewEvent.OtherChosen({ id: 'C' }),
        ]);
        expect(result.states.slice(2)).toEqual([
          ViewState.Diff({ other: 'B', index: 4 }),
          ViewState.Diff({ other: 'B', index: 2 }),
          ViewState.Diff({ other: 'C', index: 2 }),
        ]);
      }),
  );

  it.effect('a set of one version has neither: a link to either opens All', () =>
    Effect.gen(function* () {
      for (const initial of [
        ViewState.Wipe({ other: '' }),
        ViewState.Diff({ other: '', index: 1 }),
      ])
        yield* assertPath(
          viewMachine(initial, Option.none()),
          [ViewEvent.ViewChosen({ view: 'wipe' }), ViewEvent.ViewChosen({ view: 'diff' })],
          ['All', 'All', 'All'],
        );
    }),
  );

  test('five moments spread over the first video, none before the start', () => {
    expect(spreadMoments(20, 0)).toEqual([1, 5, 10, 15, 19]);
    expect(spreadMoments(20, 3)).toEqual([3, 5, 10, 15, 19]);
    expect(wrapped(0, -1, 0)).toBe(0);
  });
});
