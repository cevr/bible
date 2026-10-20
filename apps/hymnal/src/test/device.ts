/**
 * A device's playback the test holds: One's `Audio` session as a phone has
 * it, with no sound. A recording loads when played; the test moves it on
 * (`device.now`), turns the connection off and on (`device.online`), and
 * presses the lock screen's buttons (`device.press`), holds a seek back
 * until it moves the playback itself (`device.lagging`), and has the device
 * say `loading` for a few reads (`device.waiting`). What the player
 * asked is kept: each URL played, each place sought and each announcement.
 */

import { Effect, Layer, Match, Option, Queue, Stream } from 'effect';

import {
  type Announcement,
  Playback,
  PlaybackError,
  type Remote,
  type Status,
} from '../player/player';

export const fakeDevice = () => {
  const remote = Effect.runSync(Queue.unbounded<Remote>());
  const device = {
    /** The playback now. */
    now: { state: 'idle', positionMs: 0 } satisfies Status as Status,
    online: true,
    played: new Array<string>(),
    /** Each place sought, in milliseconds. */
    sought: new Array<number>(),
    /** While true, `seek` adds its place to `sought` and leaves `now` as it is. */
    lagging: false,
    /**
     * While above 0, the device says `loading` in place of its state: a
     * resume or a pause says it, and each status read says it and counts one
     * down (AVPlayer waits a few ms to play after a resume; the web loads a
     * paused place it does not hold).
     */
    waiting: 0,
    announced: new Array<Announcement>(),
    /** The lock screen's play, pause or seek: the session moves to `next`, then tells the app. */
    press: (kind: Remote, next: Status) => {
      device.now = next;
      Queue.offerUnsafe(remote, kind);
    },
  };
  /** What the device says of `status`: `loading` while it waits. */
  const said = (status: Status): Status =>
    Option.match(
      Option.liftPredicate(status, () => device.waiting > 0),
      { onNone: () => status, onSome: (waiting) => ({ ...waiting, state: 'loading' }) },
    );
  const at = (next: Status) =>
    Effect.sync(() => {
      device.now = next;
      return said(next);
    });
  const layer = Layer.succeed(
    Playback,
    Playback.of({
      play: (uri) =>
        Effect.suspend(() => {
          device.played.push(uri);
          if (!device.online) {
            return Effect.fail(
              PlaybackError.make({
                operation: 'play',
                message: 'The Internet connection appears to be offline.',
              }),
            );
          }
          return at({ state: 'loading', positionMs: 0 });
        }),
      pause: Effect.suspend(() => at({ ...device.now, state: 'paused' })),
      // A recording played to its end plays again from its start.
      resume: Effect.suspend(() =>
        at({
          ...device.now,
          state: 'playing',
          positionMs: Match.value(device.now).pipe(
            Match.when({ state: 'ended' }, () => 0),
            Match.orElse((now) => now.positionMs),
          ),
        }),
      ),
      seek: (positionMs) =>
        Effect.suspend(() => {
          device.sought.push(positionMs);
          return Match.value(device.lagging).pipe(
            Match.when(true, () => Effect.succeed(device.now)),
            Match.orElse(() => at({ ...device.now, positionMs })),
          );
        }),
      status: Effect.sync(() => {
        const now = said(device.now);
        device.waiting = Math.max(0, device.waiting - 1);
        return now;
      }),
      online: Effect.sync(() => device.online),
      announce: (announcement) => Effect.sync(() => void device.announced.push(announcement)),
      remote: Stream.fromQueue(remote),
    }),
  );
  return { device, layer };
};
