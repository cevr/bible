/**
 * The score clock (`sound.ts`) over a device the test holds, under the
 * TestClock: sound off runs silently from the first sung line, a switch
 * mid-play hands the place over, and a hymn the recording does not play to
 * its end runs on silently to its timeline's end.
 */

import { Clock, Effect, Layer, Option, References, Stream, SubscriptionRef } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { TestClock } from 'effect/testing';
import bundled from 'virtual:hymnal-timing';

import { audioUrl } from '~/remote';

import { placeAt, type Timeline, timingBook } from '../follow/timeline';
import { fakeDevice } from '../test/device';
import {
  Command,
  Playback,
  type PlaybackApi,
  Player,
  playerOn,
  type Status,
  statusEvery,
} from './player';
import { hymnOf, scoreClock, soundOn } from './sound';

const book = timingBook(bundled);
const timelineOf = (hymn: number): Timeline => Option.getOrThrow(book.of(hymn));

/** One poll of the player (`statusEvery`), ms. */
const POLL = 250;

/** A device holding a recording `length` ms long that moves with the clock, and what it was asked. */
const recording = (length: number) => {
  const asked = { play: new Array<readonly [string, number]>(), pause: 0, stop: 0 };
  let state: Status['state'] = 'idle';
  let at = 0;
  let since = 0;
  const read = Effect.map(Clock.currentTimeMillis, (now): Status => {
    if (state === 'playing') at = Math.min(length, at + now - since);
    since = now;
    if (state === 'playing' && at >= length) state = 'ended';
    return { state, positionMs: at, durationMs: length };
  });
  const then = (change: () => void) =>
    Effect.flatMap(read, () => {
      change();
      return read;
    });
  const device: PlaybackApi = {
    play: (uri, fromMs) =>
      then(() => {
        asked.play.push([uri, fromMs]);
        at = fromMs;
        state = 'playing';
      }),
    pause: then(() => {
      asked.pause += 1;
      state = 'paused';
    }),
    resume: then(() => {
      if (state === 'ended') at = 0;
      state = 'playing';
    }),
    seek: (ms) =>
      then(() => {
        at = ms;
      }),
    status: read,
    stop: Effect.asVoid(
      then(() => {
        asked.stop += 1;
        state = 'idle';
      }),
    ),
    connection: Stream.make(true),
    announce: () => Effect.void,
    remote: Stream.empty,
  };
  return { device, asked };
};

/** The score clock over `device`, sound set to `on`. */
const clockOver = (device: PlaybackApi, on: boolean) =>
  Effect.gen(function* () {
    const sound = yield* SubscriptionRef.make(on);
    const api = yield* scoreClock(device, book.of, sound);
    return { api, sound };
  });

describe('a recording URL', () => {
  it.effect('names its hymn', () =>
    Effect.sync(() => {
      expect(hymnOf(audioUrl(100))).toEqual(Option.some(100));
      expect(Option.isNone(hymnOf('https://example.com/audio/x.mp3'))).toBe(true);
    }),
  );
});

describe('the score clock', () => {
  it.effect(
    'with sound off, plays from the first sung line at 1000 ms a second, and never the device',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { device, asked } = recording(600_000);
          const { api } = yield* clockOver(device, false);
          const { first, end } = timelineOf(100);
          expect(first).toBeGreaterThan(0);

          const started = yield* api.play(audioUrl(100), 0);
          expect(started).toEqual({ state: 'playing', positionMs: first, durationMs: end });
          yield* TestClock.adjust(1000);
          expect((yield* api.status).positionMs).toBe(first + 1000);
          yield* TestClock.adjust(4000);
          expect((yield* api.status).positionMs).toBe(first + 5000);

          // Pause holds the place; resume and seek move it as the device's do.
          expect((yield* api.pause).state).toBe('paused');
          yield* TestClock.adjust(3000);
          expect((yield* api.status).positionMs).toBe(first + 5000);
          yield* api.resume;
          yield* api.seek(first + 20_000);
          yield* TestClock.adjust(500);
          expect(yield* api.status).toEqual({
            state: 'playing',
            positionMs: first + 20_500,
            durationMs: end,
          });

          // To the timeline's end, then ended there.
          yield* TestClock.adjust(end);
          expect(yield* api.status).toEqual({ state: 'ended', positionMs: end, durationMs: end });
          expect(asked.play).toEqual([]);
        }),
      ),
  );

  it.effect('hands the place over within one poll when the switch moves mid-play', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { device, asked } = recording(600_000);
        const { api, sound } = yield* clockOver(device, true);
        const uri = audioUrl(100);
        yield* api.play(uri, 0);
        yield* TestClock.adjust(30_000);
        const before = (yield* api.status).positionMs;

        // Off: the device pauses and the clock runs on from its place.
        yield* SubscriptionRef.set(sound, false);
        yield* TestClock.adjust(POLL);
        const off = yield* api.status;
        expect(off.state).toBe('playing');
        expect(Math.abs(off.positionMs - (before + POLL))).toBeLessThanOrEqual(POLL);
        expect(asked.pause).toBe(1);
        yield* TestClock.adjust(10_000);
        expect((yield* device.status).state).toBe('paused');

        // On: the device plays from the clock's place.
        const silent = (yield* api.status).positionMs;
        yield* SubscriptionRef.set(sound, true);
        yield* TestClock.adjust(POLL);
        const on = yield* api.status;
        expect(asked.play.length).toBe(2);
        const [, from] = asked.play[1] ?? [uri, -1];
        expect(Math.abs(from - silent)).toBeLessThanOrEqual(POLL);
        expect(on.state).toBe('playing');
        expect(Math.abs(on.positionMs - (silent + POLL))).toBeLessThanOrEqual(POLL);
      }),
    ),
  );

  it.effect(
    'with sound on, runs past the recording’s end to the end of a hymn’s unplayed stanzas',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const timeline = timelineOf(6);
          const last = timeline.lines.at(-1);
          expect(last?.played).toBe(false);
          // The recording ends where its last played line does.
          const length = Math.max(...timeline.lines.filter((l) => l.played).map((l) => l.until));
          expect(timeline.end - length).toBeGreaterThan(10_000);
          const { device } = recording(length);
          const { api } = yield* clockOver(device, true);

          const started = yield* api.play(audioUrl(6), 0);
          expect(started.durationMs).toBe(timeline.end);
          // The player reads the status once a poll.
          for (let t = 0; t < length + 5000; t += POLL) {
            yield* TestClock.adjust(POLL);
            yield* api.status;
          }
          expect((yield* device.status).state).toBe('ended');
          const past = yield* api.status;
          expect(past.state).toBe('playing');
          expect(past.durationMs).toBe(timeline.end);
          expect(Math.abs(past.positionMs - (length + 5000))).toBeLessThanOrEqual(POLL);
          yield* TestClock.adjust(timeline.end);
          expect(yield* api.status).toEqual({
            state: 'ended',
            positionMs: timeline.end,
            durationMs: timeline.end,
          });
        }),
      ),
  );
});

/** Let the player's fibers run what the clock's last move woke. */
const settle = Effect.forEach(Array.from({ length: 10 }), () => Effect.yieldNow, {
  discard: true,
});

/** The device's playback with a `play` that never answers: the device loads and says nothing more. */
const hung = (layer: Layer.Layer<Playback>) =>
  Layer.effect(Playback)(
    Effect.gen(function* () {
      const api = yield* Playback;
      return Playback.of({
        ...api,
        play: (uri, fromMs) => Effect.andThen(api.play(uri, fromMs), Effect.never),
      });
    }),
  ).pipe(Layer.provide(layer));

/**
 * The app's player as `LivePlayer.tsx` builds it, over the score clock over a
 * device the test holds, sound set to `on`, on the test's clock; its
 * commands and lock-screen follower run until the test's `using` ends.
 */
const composed = (
  on: boolean,
  device: (layer: Layer.Layer<Playback>) => Layer.Layer<Playback> = (layer) => layer,
) =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed);
    const clockLayer = Layer.succeed(Clock.Clock, clock);
    const fake = fakeDevice();
    const sound = yield* SubscriptionRef.make(on);
    const playback = device(fake.layer);
    const player = playerOn(
      Layer.mergeAll(
        soundOn(playback, book.of, sound).pipe(Layer.provide(clockLayer)),
        clockLayer,
        Layer.succeed(References.MinimumLogLevel, 'None'),
      ),
      statusEvery,
    );
    const registry = AtomRegistry.make();
    registry.mount(player.send);
    registry.mount(player.remote);
    const state = () => registry.get(player.state);
    return {
      device: fake.device,
      sound,
      state,
      send: (command: Command) => registry.set(player.send, command),
      /** The player's state once `holds` is true of it, moving the clock a poll at a time for at most `ms`. */
      until: (holds: (player: Player) => boolean, ms: number) =>
        Effect.gen(function* () {
          yield* settle;
          for (let t = 0; t < ms && !holds(state()); t += POLL) {
            yield* TestClock.adjust(POLL);
            yield* settle;
          }
          return state();
        }),
      [Symbol.dispose]: () => registry.dispose(),
    };
  });

const morning = { number: 100, title: 'Hymn 100' };

describe('the player over the score clock', () => {
  it.effect(
    'with sound off, one Start plays from the first sung line with no seek, and the device never sounds',
    () =>
      Effect.gen(function* () {
        using app = yield* composed(false);
        const timeline = timelineOf(100);
        app.send(Command.Start({ track: morning }));
        const shown = yield* app.until(Player.$is('Playing'), 2000);
        expect(shown._tag).toBe('Playing');
        const at = Option.getOrThrow(Option.liftPredicate(shown, Player.$is('Playing'))).at * 1000;
        expect(at).toBeGreaterThanOrEqual(timeline.first);
        // The follow marks line 0 at the place the player shows.
        expect(placeAt(timeline, at).line).toBe(0);
        expect(app.device.played).toEqual([]);
        expect(app.device.sought).toEqual([]);
      }),
  );

  it.effect('with sound on, one Start plays the recording (the control)', () =>
    Effect.gen(function* () {
      using app = yield* composed(true);
      app.send(Command.Start({ track: morning }));
      yield* app.until(Player.$is('Loading'), 0);
      app.device.now = { state: 'playing', positionMs: 500, durationMs: 151_000 };
      expect((yield* app.until(Player.$is('Playing'), 2000))._tag).toBe('Playing');
      expect(app.device.played).toEqual([audioUrl(100)]);
      expect(app.device.sought).toEqual([]);
    }),
  );

  it.effect(
    'reads the device while its play hangs, and gives the load up 15 s into it offline',
    () =>
      Effect.gen(function* () {
        using app = yield* composed(true, hung);
        app.send(Command.Start({ track: morning }));
        yield* app.until(Player.$is('Loading'), 0);
        app.device.online = false;
        const shown = yield* app.until(Player.$is('Failed'), 40_000);
        expect(shown).toEqual(Player.Failed({ track: morning, offline: true, at: Option.none() }));
      }),
  );

  it.effect('while the device’s play hangs, Sound off plays on the score clock', () =>
    Effect.gen(function* () {
      using app = yield* composed(true, hung);
      app.send(Command.Start({ track: morning }));
      yield* app.until(Player.$is('Loading'), 0);
      yield* SubscriptionRef.set(app.sound, false);
      expect((yield* app.until(Player.$is('Playing'), 2000))._tag).toBe('Playing');
    }),
  );

  it.effect('while the device’s play hangs, Pause lets the recording go', () =>
    Effect.gen(function* () {
      using app = yield* composed(true, hung);
      app.send(Command.Start({ track: morning }));
      yield* app.until(Player.$is('Loading'), 0);
      app.send(Command.Pause());
      expect((yield* app.until(Player.$is('Stopped'), 2000))._tag).toBe('Stopped');
      expect(app.device.stopped).toBe(1);
    }),
  );
});
