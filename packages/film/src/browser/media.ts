// What plays: a `Playable` is anything the pages play and keep in time (live
// a `<video>` or an `<audio>`, `media-browser.ts`; a fake in a test; a
// player of its own over decoded frames and an `AudioContext` could be
// another). The drivers (the review's synced player, `lab/review/sync.ts`;
// the preview's narration, `player/narration.ts`) reach media only through
// it: time is read from it, a seek is done once the frame at that time is
// shown, play and pause are effects. `Media` owns what is the host's rule:
// what a refused play means (`play`: the browser's refusal of sound nobody
// asked for is `Blocked`, a play a pause cut short is `Aborted`), the
// fallback to muted play (`playOrMute`), the audio a page makes
// (`audio(src)`), and the one sound context the WebCodecs panes play
// through (`sound`): made on the first ask, which a press makes, so the
// browser lets it run; asked again on each play, so a context the browser
// held suspended is woken by the next press; and made with the audio session
// set to `playback`, so an iPhone's silent switch does not mute it, as it
// does not a `<video>`.

import { Context, Data, Effect, Layer, Option } from 'effect';

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
   * The page's one sound context, woken: ask it in a press (a play is one).
   * None where the page makes no sound of its own (a test).
   */
  readonly sound: Effect.Effect<Option.Option<AudioContext>>;
}

export class Media extends Context.Service<Media, MediaOps>()('@bible/film/browser/Media') {
  /**
   * The host's media, its audio made by `audio` (live an `Audio` element, a
   * fake in a test), its sound context by `sound` (live the page's one
   * `AudioContext`; none in a test).
   */
  static readonly layerOver = (
    audio: (src: string) => Playable,
    sound: () => Option.Option<AudioContext> = () => Option.none(),
  ): Layer.Layer<Media> =>
    Layer.succeed(
      Media,
      Media.of({
        audio,
        play,
        sound: Effect.sync(sound),
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
