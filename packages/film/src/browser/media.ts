// What plays: a `Playable` is anything the pages play and keep in time (a
// `<video>` or an `<audio>` the page shows, `playableOf`; an `Audio` the
// page makes, `media-browser.ts`; a compare's pane over decoded frames,
// `frame-pane.ts`; a fake in a test). The drivers (the review's synced
// player, `lab/review/sync.ts`; the preview's narration,
// `player/narration.ts`) reach media only through it: time is read from it,
// a seek is done once the frame at that time is shown, play and pause are
// effects. `Media` owns what is the host's rule: what a refused play means
// (`play`: the browser's refusal of sound nobody asked for is `Blocked`, a
// play a pause cut short is `Aborted`), the fallback to muted play
// (`playOrMute`), the audio a page makes (`audio(src)`), and the engine a
// compare plays on (`compare`: the WebCodecs panes where the browser and
// the files allow, `webcodecs-browser.ts`, else `<video>`). The panes'
// sound context is that live adapter's own (`media-browser.ts`
// `pageSound`).

import { type Cause, Context, Data, Effect, Layer, Option, type Scope } from 'effect';
import type { Engine } from './media-choice.ts';

/** A refused play, as the media said it: its error's name (`NotAllowedError`, `AbortError`, …). */
export class PlayRefused extends Data.TaggedError('PlayRefused')<{ readonly name: string }> {}

/** The things a playable says it did. */
export type MediaEvent = 'canplay' | 'measured' | 'stalled' | 'ended' | 'error';

export interface Playable {
  /** Where it is now, in seconds. */
  readonly time: () => number;
  /** How long it is, in seconds: not a finite number until it is measured. */
  readonly duration: () => number;
  /** Whether it can play on now without waiting for more of itself. */
  readonly ready: () => boolean;
  /** Whether it has been asked to play and has not paused since. */
  readonly playing: () => boolean;
  readonly seeking: () => boolean;
  readonly ended: () => boolean;
  /** Show the frame at `t` seconds: done once it is shown (or once a later seek takes its place). */
  readonly seek: (t: number) => Effect.Effect<void>;
  /** Play from where it is: done once it plays, or refused. */
  readonly play: Effect.Effect<void, PlayRefused>;
  readonly pause: Effect.Effect<void>;
  readonly mute: (muted: boolean) => void;
  readonly rate: (rate: number) => void;
  /** Hear `event` until `signal` aborts. */
  readonly on: (event: MediaEvent, listener: () => void, signal: AbortSignal) => void;
}

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

/** `el` (a `<video>` or an `<audio>`) as a `Playable`. */
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

/** A compare's panes, one per canvas, on one clock, and the letting go of them all. */
export interface ComparePanes {
  readonly panes: ReadonlyArray<Playable>;
  /** Let every pane and every render opened for them go. */
  readonly dispose: () => void;
}

/** The engine a compare plays on, chosen for its renders, and its panes over canvases. */
export interface Compare {
  readonly engine: Engine;
  /** Panes over the renders, each painted on its canvas: none where the engine is `<video>`. */
  readonly panes: (canvases: ReadonlyArray<HTMLCanvasElement>) => ComparePanes;
}

/** A compare on `<video>`, for `why`: no panes. */
export const onVideo = (why: string): Compare => ({
  engine: { engine: 'video', why },
  panes: () => ({ panes: [], dispose: () => {} }),
});

/** What a play came to. */
export type Played = Data.TaggedEnum<{
  Playing: {};
  /** It plays, muted: the browser refused its sound. */
  Muted: {};
  /** The browser refuses its sound until the viewer clicks. */
  Blocked: {};
  /** A pause cut the play short: the media did as asked. */
  Aborted: {};
  /** It cannot play. */
  Failed: { readonly name: string };
}>;
export const Played = Data.taggedEnum<Played>();

/** What a refusal means. */
const refusal = (refused: PlayRefused): Played => {
  if (refused.name === 'NotAllowedError') return Played.Blocked();
  if (refused.name === 'AbortError') return Played.Aborted();
  return Played.Failed({ name: refused.name });
};

/** Play `media`: what came of it. */
const play = (media: Playable): Effect.Effect<Played> =>
  media.play.pipe(
    Effect.as(Played.Playing()),
    Effect.catchTag('PlayRefused', (refused) => Effect.succeed(refusal(refused))),
  );

interface MediaOps {
  /** The audio at `src`, loading. */
  readonly audio: (src: string) => Playable;
  /** Play `media`: what came of it. */
  readonly play: (media: Playable) => Effect.Effect<Played>;
  /** Play `media`; if the browser refuses its sound, play it muted. */
  readonly playOrMute: (media: Playable) => Effect.Effect<Played>;
  /**
   * The engine a compare of the renders at `urls` plays on, chosen by what
   * the browser and the files allow; whatever it opens is the scope's from
   * the moment it is made.
   */
  readonly compare: (urls: ReadonlyArray<string>) => Effect.Effect<Compare, never, Scope.Scope>;
}

/** A host whose compares play on `<video>`: a server render's, a test's, a page with no panes. */
const NO_PANES = () => Effect.succeed(onVideo('this page has no WebCodecs panes'));

export class Media extends Context.Service<Media, MediaOps>()('@bible/film/browser/Media') {
  /**
   * The host's media, its audio made by `audio` (live an `Audio` element, a
   * fake in a test), its compares chosen by `compare` (live the review
   * page's WebCodecs panes, `webcodecs-browser.ts`; `<video>` elsewhere).
   */
  static readonly layerOver = (
    audio: (src: string) => Playable,
    compare: MediaOps['compare'] = NO_PANES,
  ): Layer.Layer<Media> =>
    Layer.succeed(
      Media,
      Media.of({
        audio,
        play,
        compare,
        playOrMute: (media) =>
          Effect.flatMap(play(media), (played) => {
            if (played._tag !== 'Blocked') return Effect.succeed(played);
            media.mute(true);
            return Effect.map(play(media), (again) =>
              Played.$match(again, {
                Playing: () => Played.Muted(),
                Muted: () => again,
                Blocked: () => again,
                Aborted: () => again,
                Failed: () => again,
              }),
            );
          }),
      }),
    );
}
