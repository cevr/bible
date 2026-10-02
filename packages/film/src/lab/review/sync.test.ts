// The synced player's driver over stand-in media (seen through the live
// adapter) and frames run by hand: the clock's time is told to the machine
// as it moves; a video that drifts from the clock is put back on it, one
// within the drift is left alone; a set waiting on a stalled video resumes
// once every video can play on; a play the browser refuses sound for plays
// muted; only the audible video is unmuted.

import { describe, expect, it, test } from 'effect-bun-test';
import { Effect, Layer } from 'effect';
import { manualFrames } from '../../browser/fixtures/frames.ts';
import { fakeMedia } from '../../browser/fixtures/media.ts';
import { hostOf } from '../../browser/host.ts';
import { Media } from '../../browser/media.ts';
import { type SyncEvent, SyncState } from './machine.ts';
import { makeSync } from './sync.ts';

/** A set's clock at `t` seconds, `a` audible. */
const clock = (t: number, seek = 0) => ({
  t,
  start: 0,
  end: 10,
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
  a.el.load(10);
  b.el.load(10);
  driver.attach('a', a.media);
  driver.attach('b', b.media);
  return { frames, told, driver, a, b, tags: () => told.map((e) => e._tag) };
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
    expect(b.asked).toEqual(['seek 2']);
    expect(told.at(-1)).toMatchObject({ _tag: 'Ticked', t: 2 });
  });

  test('a paused set asks for no frame; a seek moves every video', () => {
    const { frames, driver, a, b } = rig();
    driver.apply(SyncState.Paused(clock(3, 1)));
    expect(frames.pending()).toBe(0);
    expect(a.asked.slice(-2)).toEqual(['seek 3', 'pause']);
    expect(b.asked.slice(-2)).toEqual(['seek 3', 'pause']);
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

  test('stopped, every video is paused and no frame is asked for', () => {
    const { frames, driver, a, b } = rig();
    driver.apply(SyncState.Playing(clock(0)));
    driver.stop();
    frames.frame(16);
    expect([a.el.paused, b.el.paused]).toEqual([true, true]);
    expect(frames.pending()).toBe(0);
  });
});
