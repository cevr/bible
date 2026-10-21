/**
 * The device's playback: One's `Audio` session, the same calls on a phone
 * (AVPlayer on iOS, with the lock screen and Control Center through
 * `MPNowPlayingSession`) and on the web (an `HTMLAudioElement` and the Media
 * Session). Each call's failure is a `PlaybackError` naming the call.
 *
 * A phone's session plays or pauses at the lock screen's press, then tells
 * One's listeners. On the web One's own Media Session handlers wait for the
 * element to play before they tell (`Audio.resume` waits on `play()`), so
 * the page would show the old state for as long as the recording loads.
 * There the page owns the handlers: each press is told at once and does
 * nothing else, and the player's command asks One. One drops the handlers
 * at each `play` and `stop` and sets its own at each `setNowPlayingInfo`,
 * so the page sets its own after each.
 */

import { Effect, Layer, Match, Option, Queue, Stream } from 'effect';
import { One } from 'one';
import { Platform } from 'react-native';

import { Playback, type PlaybackApi, PlaybackError, Remote } from './player';

/** One's `Audio` and `Network` as the playback uses them. */
export interface Device {
  readonly audio: Pick<
    typeof One.Audio,
    | 'play'
    | 'pause'
    | 'resume'
    | 'seek'
    | 'stop'
    | 'getPlaybackStatus'
    | 'setNowPlayingInfo'
    | 'watchRemoteCommands'
  >;
  readonly network: Pick<typeof One.Network, 'getState' | 'addStateListener'>;
}

/** The Media Session's handlers as the page sets them. */
export type Session = Pick<MediaSession, 'setActionHandler'>;

const call = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => PlaybackError.make({ operation, message: String(cause) }),
  });

/**
 * The playback over `device`, read at each call; on the web, `session` is
 * the page's Media Session, whose presses reach the player at once.
 */
export const playbackOn = (device: () => Device, session: Option.Option<Session>): PlaybackApi => {
  const audio = () => device().audio;
  /** The page's Media Session presses, kept until the player takes them. */
  const pressed = Effect.runSync(Queue.unbounded<Remote>());
  const tell = (remote: Remote) => void Queue.offerUnsafe(pressed, remote);
  /** The page's handlers in place of One's: each press told at once. */
  const own = () =>
    Option.map(session, (it) => {
      it.setActionHandler('play', () => tell(Remote.Play()));
      it.setActionHandler('pause', () => tell(Remote.Pause()));
      it.setActionHandler('seekto', (details) =>
        tell(Remote.Seek({ seconds: Option.fromNullishOr(details.seekTime) })),
      );
    });
  /** One's own lock-screen listener, on a phone. */
  const native = Stream.callback<Remote>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        audio().watchRemoteCommands((event) =>
          Queue.offerUnsafe(
            queue,
            Match.value(event.type).pipe(
              Match.when('play', () => Remote.Play()),
              Match.when('pause', () => Remote.Pause()),
              Match.orElse(() =>
                Remote.Seek({
                  seconds: Option.map(Option.fromNullishOr(event.positionMs), (ms) => ms / 1000),
                }),
              ),
            ),
          ),
        ),
      ),
      (stop) => Effect.sync(stop),
    ),
  );
  /**
   * One's connection: the state now, then each change One tells, in order.
   * A change told while the state now is read waits behind it. A device
   * whose connection cannot be read is taken as online, so a failure says
   * the recording could not play, never that it needs a connection the
   * device may have.
   */
  const connection = Stream.callback<boolean>((queue) =>
    Effect.gen(function* () {
      const early = new Array<boolean>();
      let tell = (online: boolean) => void early.push(online);
      yield* Effect.acquireRelease(
        Effect.sync(() => device().network.addStateListener((state) => tell(state.isConnected))),
        (subscription) => Effect.sync(() => subscription.remove()),
      );
      const now = yield* call('connection', () => device().network.getState()).pipe(
        Effect.map((state) => state.isConnected),
        Effect.orElseSucceed(() => true),
      );
      for (const online of [now, ...early]) Queue.offerUnsafe(queue, online);
      tell = (online) => void Queue.offerUnsafe(queue, online);
    }),
  );
  return Playback.of({
    play: (uri, fromMs) =>
      call('play', () => {
        // One drops the Media Session's handlers before this returns.
        const playing = audio().play(uri);
        own();
        return playing;
      }).pipe(
        Effect.filterOrElse(
          () => fromMs <= 0,
          () => call('seek', () => audio().seek(fromMs)),
        ),
      ),
    pause: call('pause', () => audio().pause()),
    resume: call('resume', () => audio().resume()),
    seek: (positionMs) => call('seek', () => audio().seek(positionMs)),
    status: call('status', () => audio().getPlaybackStatus()),
    // One drops the Media Session's handlers with the recording; the page's
    // Play starts it again, so its handlers stay.
    stop: call('stop', () => audio().stop()).pipe(Effect.tap(() => Effect.sync(own))),
    connection,
    announce: (announcement) =>
      call('announce', () => audio().setNowPlayingInfo(announcement)).pipe(
        Effect.tap(() => Effect.sync(own)),
      ),
    remote: Option.match(session, {
      onNone: () => native,
      onSome: () => Stream.fromQueue(pressed),
    }),
  });
};

/** The page's Media Session: the web's, where the browser has one. */
const webSession = (): Option.Option<Session> =>
  Option.liftPredicate(Platform.OS, (os) => os === 'web').pipe(
    Option.flatMap(() => Option.fromNullishOr(globalThis.navigator?.mediaSession)),
  );

export const playbackLive = Layer.succeed(
  Playback,
  playbackOn(() => ({ audio: One.Audio, network: One.Network }), webSession()),
);
