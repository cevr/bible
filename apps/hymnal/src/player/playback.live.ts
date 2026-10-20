/**
 * The device's playback: One's `Audio` session, the same calls on a phone
 * (AVPlayer on iOS, with the lock screen and Control Center through
 * `MPNowPlayingSession`) and on the web (an `HTMLAudioElement` and the Media
 * Session). Each call's failure is a `PlaybackError` naming the call.
 */

import { Effect, Layer, Queue, Stream } from 'effect';
import { One } from 'one';

import { Playback, PlaybackError, type Remote } from './player';

const call = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => PlaybackError.make({ operation, message: String(cause) }),
  });

export const playbackLive = Layer.succeed(
  Playback,
  Playback.of({
    play: (uri) => call('play', () => One.Audio.play(uri)),
    pause: call('pause', () => One.Audio.pause()),
    resume: call('resume', () => One.Audio.resume()),
    seek: (positionMs) => call('seek', () => One.Audio.seek(positionMs)),
    status: call('status', () => One.Audio.getPlaybackStatus()),
    // A device whose connection cannot be read is taken as online, so a
    // failure says the recording could not play, never that it needs a
    // connection the device may have.
    online: call('online', () => One.Network.getState()).pipe(
      Effect.map((network) => network.isConnected),
      Effect.orElseSucceed(() => true),
    ),
    announce: (announcement) => call('announce', () => One.Audio.setNowPlayingInfo(announcement)),
    remote: Stream.callback<Remote>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() =>
          One.Audio.watchRemoteCommands((event) => Queue.offerUnsafe(queue, event.type)),
        ),
        (stop) => Effect.sync(stop),
      ),
    ),
  }),
);
