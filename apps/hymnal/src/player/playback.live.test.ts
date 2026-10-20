/**
 * The live playback's remote presses (`playback.live.ts`) over a device and
 * a Media Session the test holds: on the web each press reaches the player
 * at once and asks One for nothing, after One's `play` dropped the
 * handlers and after its `setNowPlayingInfo` set its own; on a phone One's
 * lock-screen events reach the player as presses.
 */

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, Option, Stream } from 'effect';

import { type Device, type Session, playbackOn } from './playback.live';
import { type PlaybackApi, Remote } from './player';

type Action = 'play' | 'pause' | 'seekto';
type Handler = Parameters<Session['setActionHandler']>[1];
type Listener = Parameters<Device['audio']['watchRemoteCommands']>[0];

/**
 * One's web `Audio` as far as the presses go: `play` drops the Media
 * Session's handlers and loads (its promise waits), `setNowPlayingInfo` sets
 * One's own (each would resume, pause or seek, and only then tell), and
 * each call is kept. `watchRemoteCommands` keeps its listener, as a phone's
 * session does.
 */
const fake = () => {
  const handlers = new Map<Action, Handler>();
  const session: Session = {
    setActionHandler: (action, handler) =>
      void Option.match(Option.fromNullishOr(handler), {
        onNone: () => handlers.delete(action as Action),
        onSome: (it) => handlers.set(action as Action, it),
      }),
  };
  const asked = new Array<string>();
  const listeners = new Array<Listener>();
  const status = { state: 'loading', positionMs: 0 } as const;
  const said = (call: string) =>
    Effect.runPromise(
      Effect.sync(() => {
        asked.push(call);
        return status;
      }),
    );
  const one = (action: Action) => () => void asked.push(`One's ${action} handler`);
  const device: Device = {
    audio: {
      play: (uri) => {
        asked.push(`play ${uri}`);
        handlers.clear();
        return Effect.runPromise(Effect.never);
      },
      pause: () => said('pause'),
      resume: () => said('resume'),
      seek: (positionMs) => said(`seek ${positionMs}`),
      getPlaybackStatus: () => said('status'),
      setNowPlayingInfo: () =>
        Effect.runPromise(
          Effect.sync(() => {
            for (const action of ['play', 'pause', 'seekto'] as const) {
              handlers.set(action, one(action));
            }
          }),
        ),
      watchRemoteCommands: (listener) => {
        listeners.push(listener);
        return () => {};
      },
    },
    network: {
      getState: () => Effect.runPromise(Effect.succeed({ isConnected: true } as never)),
    },
  };
  /** The Media Session's `action` pressed, as the browser calls its handler. */
  const press = (action: Action, seekTime?: number) =>
    Effect.sync(() =>
      Option.getOrThrow(Option.fromNullishOr(handlers.get(action)))({ action, seekTime }),
    );
  return { session, asked, listeners, device, press };
};

/** The first `count` presses the player hears while `act` runs. */
const heard = (playback: PlaybackApi, count: number, act: Effect.Effect<void>) =>
  Effect.gen(function* () {
    const presses = yield* Stream.take(playback.remote, count).pipe(
      Stream.runCollect,
      Effect.forkChild({ startImmediately: true }),
    );
    yield* act;
    return yield* Fiber.join(presses);
  });

describe('the live playback’s remote presses', () => {
  it.effect('on the web, reach the player at the press and ask One for nothing', () =>
    Effect.gen(function* () {
      const { session, asked, device, press } = fake();
      const playback = playbackOn(() => device, Option.some(session));
      const presses = yield* heard(
        playback,
        4,
        Effect.gen(function* () {
          yield* Effect.forkChild(playback.play('https://hymns.cvr.im/audio/sdah/100.mp3'), {
            startImmediately: true,
          });
          // While the recording loads, before any announcement.
          yield* press('play');
          yield* playback.announce({ title: 'Great Is Thy Faithfulness', artist: 'Hymn 100' });
          yield* press('pause');
          yield* press('seekto', 42);
          yield* press('seekto');
        }).pipe(Effect.orDie),
      );
      expect(presses).toEqual([
        Remote.Play(),
        Remote.Pause(),
        Remote.Seek({ seconds: Option.some(42) }),
        Remote.Seek({ seconds: Option.none() }),
      ]);
      expect(asked).toEqual(['play https://hymns.cvr.im/audio/sdah/100.mp3']);
    }),
  );

  it.effect('on a phone, are One’s lock-screen events', () =>
    Effect.gen(function* () {
      const { listeners, device } = fake();
      const playback = playbackOn(() => device, Option.none());
      const presses = yield* heard(
        playback,
        3,
        Effect.gen(function* () {
          // The player's listener is set once its stream runs.
          yield* Effect.yieldNow.pipe(
            Effect.andThen(Effect.sync(() => listeners.length)),
            Effect.repeat({ until: (count) => count > 0 }),
          );
          for (const listener of listeners) {
            listener({ type: 'pause' });
            listener({ type: 'play' });
            listener({ type: 'seek', positionMs: 61_500 });
          }
        }),
      );
      expect(presses).toEqual([
        Remote.Pause(),
        Remote.Play(),
        Remote.Seek({ seconds: Option.some(61.5) }),
      ]);
    }),
  );
});
