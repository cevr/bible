/**
 * The score clock: a silent `PlaybackApi` under the player (`player.ts`),
 * over the device's own.
 *
 * With sound on, the device plays the recording. A hymn whose timeline runs
 * past the recording's end (stanzas the recording does not play) goes on
 * silently from there to the timeline's end, and the status gives the
 * timeline's length. With sound off, nothing sounds: the clock runs at
 * 1000 ms a second from the first sung line, with no count-in, and gives
 * the status the device would. A switch mid-play hands the place over: off
 * pauses the device and runs the clock from the device's place; on plays
 * the recording from the clock's place.
 */

import { Clock, Effect, Layer, Option, Stream, SubscriptionRef } from 'effect';
import * as Semaphore from 'effect/Semaphore';

import { type Clock as Run, clockAt, placeOf } from '../follow/clock';
import type { Timeline } from '../follow/timeline';
import { Playback, type PlaybackApi, PlaybackError, type Status } from './player';

/** The hymn a recording's URL plays: its file is `<number>.mp3` (`src/remote.ts`). */
export const hymnOf = (uri: string): Option.Option<number> =>
  Option.fromNullishOr(/\/(\d+)\.mp3$/.exec(uri)?.[1]).pipe(Option.map(Number));

const stateOf = (ended: boolean, playing: boolean): Status['state'] => {
  if (ended) return 'ended';
  if (playing) return 'playing';
  return 'paused';
};

/** The silent clock's status at `now`, held at the timeline's `end`. */
const clockStatus = (run: Run, end: number, now: number): Status => {
  const at = Math.min(placeOf(run, now), end);
  return { state: stateOf(at >= end, run.playing), positionMs: at, durationMs: end };
};

/** Whether the device moves, or is about to. */
const moving = (status: Status) => status.state === 'playing' || status.state === 'loading';

/** What the score clock holds across the calls. */
interface Held {
  uri: Option.Option<string>;
  timeline: Option.Option<Timeline>;
  /** The silent clock while it runs (sound off, or past the recording's end); none while the device plays. */
  clock: Option.Option<Run>;
  /** The recording's length as the device last told it, ms. */
  recorded: Option.Option<number>;
  /** Whether the device holds a recording this clock asked it to play. */
  sounding: boolean;
}

/**
 * The score clock over `device`: `timelineFor` gives a hymn's timeline, and
 * `sound` says whether the recording sounds; each change of it hands the
 * place over, for as long as the scope lasts.
 */
export const scoreClock = (
  device: PlaybackApi,
  timelineFor: (hymn: number) => Option.Option<Timeline>,
  sound: SubscriptionRef.SubscriptionRef<boolean>,
) =>
  Effect.gen(function* () {
    const lock = yield* Semaphore.make(1);
    const held: Held = {
      uri: Option.none(),
      timeline: Option.none(),
      clock: Option.none(),
      recorded: Option.none(),
      sounding: false,
    };
    const end = () => Option.match(held.timeline, { onNone: () => 0, onSome: (t) => t.end });
    const first = () => Option.match(held.timeline, { onNone: () => 0, onSome: (t) => t.first });

    /** Run the clock from `at`, playing or held. */
    const run = (at: number, playing: boolean) =>
      Effect.map(Clock.currentTimeMillis, (now) => {
        const clock = clockAt(at, playing, now);
        held.clock = Option.some(clock);
        return clockStatus(clock, end(), now);
      });

    /**
     * The device's status as the player reads it: the timeline's length, and
     * past the recording's end, the silent clock on to the timeline's end.
     */
    const fromDevice = (status: Status) => {
      held.recorded = Option.orElse(Option.fromNullishOr(status.durationMs), () => held.recorded);
      const at = status.durationMs ?? status.positionMs;
      if (status.state === 'ended' && Option.isSome(held.timeline) && end() > at)
        return run(at, true);
      return Effect.succeed(
        Option.match(Option.fromNullishOr(status.durationMs), {
          onNone: () => status,
          onSome: (ms) => ({ ...status, durationMs: Math.max(ms, end()) }),
        }),
      );
    };

    /** Whether the recording holds place `at`, as far as the device has told. */
    const recordedAt = (at: number) =>
      at < end() && Option.match(held.recorded, { onNone: () => true, onSome: (ms) => at < ms });

    /** Hand the place to the device: it plays the recording from `at`. */
    const sounded = (uri: string, at: number) =>
      Effect.gen(function* () {
        held.clock = Option.none();
        held.sounding = true;
        return yield* fromDevice(yield* device.play(uri, at));
      });

    const play = (uri: string, fromMs: number) =>
      Effect.gen(function* () {
        held.uri = Option.some(uri);
        held.timeline = Option.flatMap(hymnOf(uri), timelineFor);
        held.recorded = Option.none();
        if (yield* SubscriptionRef.get(sound)) return yield* sounded(uri, fromMs);
        if (Option.isNone(held.timeline))
          return yield* PlaybackError.make({ operation: 'play', message: `no timing for ${uri}` });
        if (held.sounding) yield* device.stop;
        held.sounding = false;
        return yield* run(Math.max(fromMs, 0) || first(), true);
      });

    /** The clock's place and whether it plays, at `now`. */
    const placed = (clock: Run, now: number) => ({
      at: Math.min(placeOf(clock, now), end()),
      playing: clock.playing,
    });

    const resumeClock = (clock: Run) =>
      Effect.gen(function* () {
        const { at } = placed(clock, yield* Clock.currentTimeMillis);
        const on = yield* SubscriptionRef.get(sound);
        const uri = Option.getOrElse(held.uri, () => '');
        if (at >= end()) {
          if (on) return yield* sounded(uri, 0);
          return yield* run(first(), true);
        }
        if (on && recordedAt(at)) return yield* sounded(uri, at);
        return yield* run(at, true);
      });

    const seekClock = (clock: Run, ms: number) =>
      Effect.gen(function* () {
        const on = yield* SubscriptionRef.get(sound);
        const uri = Option.getOrElse(held.uri, () => '');
        if (on && clock.playing && recordedAt(ms)) return yield* sounded(uri, ms);
        return yield* run(Math.min(ms, end()), clock.playing);
      });

    /** A seek while the device plays: past the recording's end, the silent clock takes it. */
    const seekDevice = (ms: number) =>
      Effect.gen(function* () {
        if (Option.isNone(held.timeline) || recordedAt(ms) || ms >= end())
          return yield* fromDevice(yield* device.seek(ms));
        const before = yield* device.status;
        yield* device.pause;
        return yield* run(ms, moving(before));
      });

    /** On a switch of `sound`: hand the place over. */
    const switchTo = (on: boolean) =>
      Effect.gen(function* () {
        const uri = Option.getOrElse(held.uri, () => '');
        if (Option.isNone(held.uri)) return;
        if (!on && Option.isNone(held.clock)) {
          const status = yield* device.status;
          yield* device.pause;
          yield* run(status.positionMs, moving(status));
          return;
        }
        const now = yield* Clock.currentTimeMillis;
        const clock = Option.filter(held.clock, (c) => on && c.playing);
        const at = Option.map(clock, (c) => placed(c, now).at);
        if (Option.isSome(at) && recordedAt(at.value)) yield* sounded(uri, at.value);
      });

    yield* SubscriptionRef.changes(sound).pipe(
      Stream.changes,
      Stream.drop(1),
      Stream.runForEach((on) =>
        lock.withPermit(
          switchTo(on).pipe(
            Effect.catch((error) =>
              Effect.logWarning(`[sound] switch.failed on=${on} message=${error.message}`),
            ),
          ),
        ),
      ),
      Effect.forkScoped,
    );

    const api: PlaybackApi = {
      play: (uri, fromMs) => lock.withPermit(play(uri, fromMs)),
      pause: lock.withPermit(
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          if (Option.isSome(held.clock)) return yield* run(placed(held.clock.value, now).at, false);
          return yield* fromDevice(yield* device.pause);
        }),
      ),
      resume: lock.withPermit(
        Effect.gen(function* () {
          if (Option.isSome(held.clock)) return yield* resumeClock(held.clock.value);
          return yield* fromDevice(yield* device.resume);
        }),
      ),
      seek: (ms) =>
        lock.withPermit(
          Effect.gen(function* () {
            if (Option.isSome(held.clock)) return yield* seekClock(held.clock.value, ms);
            return yield* seekDevice(ms);
          }),
        ),
      status: lock.withPermit(
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          if (Option.isSome(held.clock)) return clockStatus(held.clock.value, end(), now);
          return yield* fromDevice(yield* device.status);
        }),
      ),
      stop: lock.withPermit(
        Effect.gen(function* () {
          held.uri = Option.none();
          held.timeline = Option.none();
          held.clock = Option.none();
          held.recorded = Option.none();
          held.sounding = false;
          yield* device.stop;
        }),
      ),
      connection: device.connection,
      announce: device.announce,
      remote: device.remote,
    };
    return api;
  });

/** The player's playback: the score clock over `device`'s (`LivePlayer.tsx`). */
export const soundOn = (
  device: Layer.Layer<Playback>,
  timelineFor: (hymn: number) => Option.Option<Timeline>,
  sound: SubscriptionRef.SubscriptionRef<boolean>,
): Layer.Layer<Playback> =>
  Layer.effect(Playback)(
    Effect.gen(function* () {
      return yield* scoreClock(yield* Playback, timelineFor, sound);
    }),
  ).pipe(Layer.provide(device));
