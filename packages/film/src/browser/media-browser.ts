// Media elements as `Playable`s (`media.ts`): a `<video>` or an `<audio>`
// the page shows, or an `Audio` the page makes for its narration.

import { type Cause, Effect, Option } from 'effect';
import { Media, type MediaEvent, type Playable, PlayRefused } from './media.ts';

/** `HAVE_FUTURE_DATA`: an element that can play on without waiting. */
const FUTURE_DATA = 3;

/** The element's own name for each thing a playable says it did. */
const EVENTS: Record<MediaEvent, string> = {
  canplay: 'canplay',
  measured: 'loadedmetadata',
  stalled: 'waiting',
  ended: 'ended',
  error: 'error',
};

/** The name of the error a refused `play()` rejected with. */
const nameOf = (error: Cause.UnknownError): string =>
  Option.match(
    Option.liftPredicate(error.cause, (c) => c instanceof DOMException),
    {
      onNone: () => '',
      onSome: (e) => e.name,
    },
  );

/** The part of a media element a `Playable` reads and drives. */
export type MediaElement = Pick<
  HTMLMediaElement,
  | 'currentTime'
  | 'duration'
  | 'readyState'
  | 'paused'
  | 'seeking'
  | 'ended'
  | 'muted'
  | 'playbackRate'
  | 'play'
  | 'pause'
  | 'addEventListener'
>;

/** `el` as a `Playable`. */
export const playableOf = (el: MediaElement): Playable => {
  /** The seek in flight: a later seek ends its wait. */
  let seeking = new AbortController();
  return {
    time: () => el.currentTime,
    duration: () => el.duration,
    ready: () => el.readyState >= FUTURE_DATA,
    playing: () => !el.paused,
    seeking: () => el.seeking,
    ended: () => el.ended,
    seek: (t) =>
      Effect.callback<void>((resume) => {
        seeking.abort();
        const mine = new AbortController();
        seeking = mine;
        // Done once shown, or once a later seek takes its place.
        mine.signal.addEventListener('abort', () => resume(Effect.void));
        el.currentTime = t;
        // An element with nothing loaded shows the time once it loads: nothing to wait for.
        if (el.readyState === 0) mine.abort();
        else el.addEventListener('seeked', () => mine.abort(), { signal: mine.signal });
        return Effect.sync(() => mine.abort());
      }),
    play: Effect.mapError(
      Effect.tryPromise(() => el.play()),
      (error) => new PlayRefused({ name: nameOf(error) }),
    ),
    pause: Effect.sync(() => el.pause()),
    mute: (muted) => {
      el.muted = muted;
    },
    rate: (rate) => {
      el.playbackRate = rate;
    },
    on: (event, listener, signal) => el.addEventListener(EVENTS[event], listener, { signal }),
  };
};

/** The page's one sound context, made on the first ask and woken on each. */
const soundContext = () => {
  let made = Option.none<AudioContext>();
  return (): Option.Option<AudioContext> => {
    if (Option.isNone(made)) {
      // Safari's audio session (16.4+): `playback` plays through the silent switch, as a `<video>` does.
      Option.map(Option.fromNullishOr(Reflect.get(navigator, 'audioSession')), (session) =>
        Reflect.set(session, 'type', 'playback'),
      );
      made = Option.some(new AudioContext());
    }
    // A context the browser held suspended (no press yet) is woken by this one.
    Option.map(
      Option.filter(made, (ctx) => ctx.state === 'suspended'),
      (ctx) => Effect.runFork(Effect.ignore(Effect.tryPromise(() => ctx.resume()))),
    );
    return made;
  };
};

/** The page's media: its narration an `Audio` element, its panes' sound one `AudioContext`. */
export const mediaLayer = Media.layerOver((src) => playableOf(new Audio(src)), soundContext());
