// The synced player's driver over stand-in media (seen through the live
// adapter) and frames run by hand: the clock's time is told to the machine
// as it moves; a video that drifts from the clock is put back on it, one
// within the drift is left alone; a set waiting on a stalled video resumes
// once every video can play on; a play the browser refuses sound for plays
// muted; only the audible video is unmuted; the clock's media that cannot
// play is told, and so is its new media after.

import { describe, expect, it, test } from 'effect-bun-test';
import { Duration, Effect, Layer } from 'effect';
import { TestClock } from 'effect/testing';
import { manualFrames } from '../../browser/fixtures/frames.ts';
import { fakeMedia } from '../../browser/fixtures/media.ts';
import { hostOf } from '../../browser/host.ts';
import { Media } from '../../browser/media.ts';
import { SyncEvent, SyncState, UNKNOWN_END } from './machine.ts';
import { makeSync, reloadOnError } from './sync.ts';

/** Let the forked plays settle: their answers heard, and what came of them told. */
const settle = Effect.repeat(Effect.yieldNow, { times: 10 });

/** A set's clock at `t` seconds, `a` audible. */
const clock = (t: number, seek = 0) => ({
  t,
  start: 0,
  end: 10,
  fps: 30,
  rate: 1 as const,
  audible: 'a',
  seek,
});

/** A driver over two stand-in videos, `a` (the clock) and `b`, both loaded; what it told the machine. */
const rig = (refuse?: { readonly a?: string; readonly b?: string }) => {
  const frames = manualFrames();
  const told: Array<SyncEvent> = [];
  const host = hostOf(
    Layer.mergeAll(
      frames.layer,
      Media.layerOver(() => fakeMedia().media),
    ),
  );
  const driver = makeSync('a', (event) => told.push(event), host);
  const a = fakeMedia(refuse?.a);
  const b = fakeMedia(refuse?.b);
  a.el.finishLoading(10);
  b.el.finishLoading(10);
  const release = { a: driver.attach('a', a.media), b: driver.attach('b', b.media) };
  // The clock joined measured: the machine knows its end before any test begins.
  expect(told).toEqual([SyncEvent.Measured({ end: 10 })]);
  told.length = 0;
  return { frames, told, driver, a, b, release, tags: () => told.map((e) => e._tag) };
};

describe('the sync driver', () => {
  test("a playing set tells the machine the clock's time as it moves, and pulls a drifter back", () => {
    const { frames, told, driver, a, b } = rig();
    driver.apply(SyncState.Playing(clock(0)));
    a.el.currentTime = 1;
    b.el.currentTime = 1.1;
    a.asked.length = 0;
    b.asked.length = 0;
    frames.frame(16);
    expect(told.at(-1)).toMatchObject({ _tag: 'Ticked', t: 1 });
    expect(b.asked).toEqual([]);
    a.el.currentTime = 2;
    a.asked.length = 0;
    frames.frame(32);
    expect(b.asked).toEqual([`seek ${60.25 / 30}`]);
    expect(told.at(-1)).toMatchObject({ _tag: 'Ticked', t: 2 });
  });

  test('a paused set asks for no frame; a seek moves every video', () => {
    const { frames, driver, a, b } = rig();
    driver.apply(SyncState.Paused(clock(3, 1)));
    expect(frames.pending()).toBe(0);
    expect(a.asked.slice(-2)).toEqual([`seek ${90.25 / 30}`, 'pause']);
    expect(b.asked.slice(-2)).toEqual([`seek ${90.25 / 30}`, 'pause']);
  });

  test("a seek lands a quarter of a frame into the frame its time lies in, at the clock's rate: a time past that stays", () => {
    const { driver, a } = rig();
    const at = (t: number, fps: number, seek: number) =>
      driver.apply(SyncState.Paused({ ...clock(t, seek), fps }));
    // A step's frame start (frame 25 at 24, 62 at 30, 1 at 29.97): a quarter of a frame in.
    at(25 / 24, 24, 1);
    expect(a.asked.slice(-2)).toEqual([`seek ${25.25 / 24}`, 'pause']);
    at(62 / 30, 30, 2);
    expect(a.asked.slice(-2)).toEqual([`seek ${62.25 / 30}`, 'pause']);
    at(1001 / 30000, 30000 / 1001, 3);
    expect(a.asked.slice(-2)).toEqual([`seek ${1.25 / (30000 / 1001)}`, 'pause']);
    // A start with float noise in it (0.1 + 0.2 is frame 9 at 30), the same.
    at(0.1 + 0.2, 30, 4);
    expect(a.asked.slice(-2)).toEqual([`seek ${9.25 / 30}`, 'pause']);
    // A scrub's time already past the quarter is sought as it is.
    at(0.52, 24, 5);
    expect(a.asked.slice(-2)).toEqual(['seek 0.52', 'pause']);
  });

  test('a set waiting on a stalled video resumes once every video can play on', () => {
    const { frames, driver, b, tags } = rig();
    driver.apply(SyncState.Playing(clock(0)));
    b.el.readyState = 1;
    b.el.fire('waiting');
    driver.apply(SyncState.Buffering(clock(0)));
    frames.frame(16);
    expect(tags()).toEqual(['Stalled']);
    b.el.readyState = 4;
    frames.frame(32);
    expect(tags()).toEqual(['Stalled', 'Resumed']);
  });

  it.effect(
    'a set waiting on its videos does not wait on one whose media failed, and leaves it where it is',
    () =>
      Effect.gen(function* () {
        const { frames, driver, a, b, tags } = rig({ b: 'NotSupportedError' });
        driver.apply(SyncState.Playing(clock(0)));
        yield* b.answered;
        yield* settle;
        // The failed video can never play on: the set waits on the ones that can.
        b.el.readyState = 1;
        driver.apply(SyncState.Buffering(clock(0)));
        frames.frame(16);
        expect(tags()).toEqual(['Resumed']);
        // Nor is it pulled to the clock, or told to play again.
        driver.apply(SyncState.Playing(clock(0)));
        b.asked.length = 0;
        a.el.currentTime = 2;
        frames.frame(32);
        expect(b.asked).toEqual([]);
      }),
  );

  it.effect(
    'a play the browser refuses sound for plays muted; only the audible video is unmuted',
    () =>
      Effect.gen(function* () {
        const { driver, a, b } = rig({ a: 'NotAllowedError' });
        driver.apply(SyncState.Playing(clock(0)));
        expect([a.el.muted, b.el.muted]).toEqual([false, true]);
        // The refused play's answer heard, the driver plays it again, muted.
        yield* a.answered;
        yield* a.answered;
        expect(a.asked.filter((asked) => asked === 'play')).toEqual(['play', 'play']);
        expect(a.el.muted).toBe(true);
        expect(a.el.paused).toBe(false);
      }),
  );

  it.effect('a seek still pending ends when its video is replaced, released or stopped', () =>
    Effect.gen(function* () {
      const { driver, a, b, release } = rig();
      const c = fakeMedia();
      c.el.finishLoading(10);
      for (const v of [a, b, c]) v.el.holdsSeeks = true;
      driver.attach('c', c.media);
      driver.apply(SyncState.Paused(clock(3, 1)));
      yield* Effect.yieldNow;
      const waiting = () => [a, b, c].map((v) => v.el.listening('seeked'));
      expect(waiting()).toEqual([1, 1, 1]);
      // `a`'s card shows another video: the seek it began is no longer waited on.
      driver.attach('a', fakeMedia().media);
      yield* Effect.yieldNow;
      expect(waiting()).toEqual([0, 1, 1]);
      release.b();
      yield* Effect.yieldNow;
      expect(waiting()).toEqual([0, 0, 1]);
      driver.stop();
      yield* Effect.yieldNow;
      expect(waiting()).toEqual([0, 0, 0]);
    }),
  );

  test('a video let go after another took its place leaves the one in its place', () => {
    const { driver, a, release } = rig();
    const next = fakeMedia();
    next.el.finishLoading(10);
    driver.attach('a', next.media);
    release.a();
    driver.apply(SyncState.Paused(clock(4, 1)));
    expect(next.asked.slice(-2)).toEqual([`seek ${120.25 / 30}`, 'pause']);
    expect(a.asked).not.toContain(`seek ${120.25 / 30}`);
  });

  it.effect('a player says its clock cannot play: a play refused as unsupported', () =>
    Effect.gen(function* () {
      const { driver, a, told, frames } = rig({ a: 'NotSupportedError' });
      driver.apply(SyncState.Playing(clock(0)));
      yield* a.answered;
      yield* settle;
      expect(told).toEqual([SyncEvent.MediaFailed({ reason: 'NotSupportedError' })]);
      // Failed, its videos are paused and its clock's loop stops.
      driver.apply(SyncState.Failed({ ...clock(0), reason: 'NotSupportedError' }));
      frames.frame(16);
      expect(frames.pending()).toBe(0);
      expect(a.el.paused).toBe(true);
    }),
  );

  test("a player says its clock's media failed, never another's", () => {
    const { a, b, tags } = rig();
    b.el.fire('error');
    expect(tags()).toEqual([]);
    a.el.fire('error');
    expect(tags()).toEqual(['MediaFailed']);
  });

  test("the clock's new media, after its last failed, is told; another's, or over a clock that plays, is not", () => {
    const { driver, tags } = rig();
    // Not measured yet, as a fresh element is: only the replacement is told.
    const media = () => fakeMedia().media;
    driver.apply(SyncState.Playing(clock(2)));
    driver.attach('a', media());
    expect(tags()).toEqual([]);
    driver.apply(SyncState.Failed({ ...clock(2), reason: 'error' }));
    driver.attach('b', media());
    expect(tags()).toEqual([]);
    driver.attach('a', media());
    expect(tags()).toEqual(['MediaReplaced']);
  });

  it.effect(
    'a media that fails to load is asked for again after the wait, up to its tries, until stopped',
    () =>
      Effect.gen(function* () {
        const host = yield* Effect.context<never>();
        const { el, media, asked } = fakeMedia();
        const stop = reloadOnError(media, host, Duration.seconds(5), 2);
        el.fire('error');
        expect(asked).toEqual([]);
        yield* TestClock.adjust('5 seconds');
        expect(asked).toEqual(['load']);
        el.fire('error');
        yield* TestClock.adjust('5 seconds');
        expect(asked).toEqual(['load', 'load']);
        // Out of tries: a third failure is left.
        el.fire('error');
        yield* TestClock.adjust('5 seconds');
        expect(asked).toEqual(['load', 'load']);
        stop();
        expect(el.listening('error')).toBe(0);
      }),
  );

  it.effect('a retry waiting when the media is let go never asks', () =>
    Effect.gen(function* () {
      const host = yield* Effect.context<never>();
      const { el, media, asked } = fakeMedia();
      const stop = reloadOnError(media, host, Duration.seconds(5), 2);
      el.fire('error');
      stop();
      yield* TestClock.adjust('10 seconds');
      expect(asked).toEqual([]);
    }),
  );

  test("a clock that follows another version tells that one's end, failure and ending, and hears only it after", () => {
    const { driver, a, b, told, tags } = rig();
    b.el.finishLoading(6);
    driver.follow('b');
    expect(told).toEqual([SyncEvent.ClockMoved({ end: 6 })]);
    // The version it followed before is heard no more; this one is.
    a.el.fire('ended');
    a.el.fire('error');
    expect(tags()).toEqual(['ClockMoved']);
    b.el.fire('ended');
    expect(tags()).toEqual(['ClockMoved', 'Ended']);
    // Following one whose media failed, or that ended already, says so; following the same, nothing.
    a.el.ended = true;
    driver.follow('a');
    expect(tags()).toEqual(['ClockMoved', 'Ended', 'ClockMoved', 'MediaFailed', 'Ended']);
    driver.follow('a');
    expect(tags()).toHaveLength(5);
  });

  test('a clock that follows a version not attached yet says its end is not known', () => {
    const { driver, told } = rig();
    driver.follow('c');
    expect(told).toEqual([SyncEvent.ClockMoved({ end: UNKNOWN_END })]);
  });

  test("while the leading version has no video, the set's time comes from no other: one clock, its time and its events one video's", () => {
    const frames = manualFrames();
    const told: Array<SyncEvent> = [];
    const host = hostOf(
      Layer.mergeAll(
        frames.layer,
        Media.layerOver(() => fakeMedia().media),
      ),
    );
    const driver = makeSync('a', (event) => told.push(event), host);
    const b = fakeMedia();
    b.el.finishLoading(6);
    driver.attach('b', b.media);
    driver.apply(SyncState.Playing(clock(0)));
    b.el.currentTime = 2;
    frames.frame(16);
    b.el.fire('ended');
    expect(told.map((e) => e._tag)).toEqual([]);
    // Led by b, b is the clock: its time, its end and its ending.
    driver.follow('b');
    b.el.currentTime = 3;
    frames.frame(16);
    b.el.fire('ended');
    expect(told).toEqual([
      SyncEvent.ClockMoved({ end: 6 }),
      SyncEvent.Ticked({ t: 3 }),
      SyncEvent.Ended,
    ]);
  });

  test("the clock's video measured before it joins the set is told: its end is known, not waited on", () => {
    const frames = manualFrames();
    const told: Array<SyncEvent> = [];
    const host = hostOf(
      Layer.mergeAll(
        frames.layer,
        Media.layerOver(() => fakeMedia().media),
      ),
    );
    const driver = makeSync('a', (event) => told.push(event), host);
    // Its `loadedmetadata` fired before it was attached: no `measured` is heard after.
    const a = fakeMedia();
    a.el.finishLoading(8);
    const b = fakeMedia();
    b.el.finishLoading(6);
    driver.attach('b', b.media);
    expect(told).toEqual([]);
    driver.attach('a', a.media);
    expect(told).toEqual([SyncEvent.Measured({ end: 8 })]);
  });

  test('stopped, every video is paused and no frame is asked for', () => {
    const { frames, driver, a, b } = rig();
    driver.apply(SyncState.Playing(clock(0)));
    driver.stop();
    frames.frame(16);
    expect([a.el.paused, b.el.paused]).toEqual([true, true]);
    expect(frames.pending()).toBe(0);
  });
});
