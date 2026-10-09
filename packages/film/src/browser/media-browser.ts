// The page's own media (`media.ts`): the `Audio` it makes for its narration,
// and its one sound context, which the compare's WebCodecs panes play
// through (`webcodecs-browser.ts`). The context is made on the first ask,
// which a press makes, so the browser lets it run; asked again on each play,
// so a context the browser held suspended is woken by the next press; and
// made with the audio session set to `playback`, so an iPhone's silent
// switch does not mute it, as it does not a `<video>`.

import { Context, Effect, Layer, Option } from 'effect';
import type { Frames } from './frames.ts';
import { type BrowserCodecs, browserEngine } from './media-choice.ts';
import { Media, type Playable, onVideo, playableOf } from './media.ts';
import { Viewport } from './viewport.ts';

/** The page's one sound context, made on the first ask and woken on each. */
const soundContext = () => {
  let made = Option.none<AudioContext>();
  return (): Option.Option<AudioContext> => {
    if (Option.isNone(made)) {
      // Safari's audio session (16.4+): `playback` plays through the silent switch, as a `<video>` does.
      Option.map(
        // oxlint-disable-next-line effect/noReflectGet -- Safari's own member, which the DOM's types do not name
        Option.fromNullishOr(Reflect.get(navigator, 'audioSession')),
        (session) => Reflect.set(session, 'type', 'playback'),
      );
      // oxlint-disable-next-line no-restricted-globals -- Media's live adapter: the page's one sound context
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

/** The audio at `src`, as the page makes it: an `Audio` element. */
export const pageAudio = (src: string): Playable =>
  // oxlint-disable-next-line no-restricted-globals -- Media's live adapter: the audio the page makes
  playableOf(new Audio(src));

/** The page's one sound context: what its compare's panes play through. */
export const pageSound: () => Option.Option<AudioContext> = soundContext();

/** A phone or a tablet, as its pointer says: what plays `<video>` until one is measured. */
const COARSE = '(pointer: coarse)';

/** What this browser can decode, and whether it is a phone (`phone`, the host's `Viewport`'s answer). */
export const browserCodecs = (phone: boolean): BrowserCodecs => ({
  videoDecoder: 'VideoDecoder' in globalThis,
  audioDecoder: 'AudioDecoder' in globalThis,
  phone,
});

/** Whether the host's window is a phone's or a tablet's. */
export const isPhone = (host: Context.Context<Viewport>): Effect.Effect<boolean> =>
  Context.get(host, Viewport).matches(COARSE);

/**
 * The review page's media: the page's own, its compares on WebCodecs panes
 * where the browser and the files allow. The panes' module, with the
 * decoders (mediabunny) it carries, loads only when the browser allows the
 * panes at all: a phone, or a browser with no `VideoDecoder`, plays `<video>`
 * and downloads none of it.
 */
export const panesMediaLayer: Layer.Layer<Media, never, Frames | Viewport> = Layer.unwrap(
  Effect.map(Effect.context<Frames | Viewport>(), (host) =>
    Media.layerOver(pageAudio, (urls) =>
      Effect.gen(function* () {
        const allowed = browserEngine(browserCodecs(yield* isPhone(host)));
        if (allowed.engine === 'video') return onVideo(allowed.why);
        const { compareOn } = yield* Effect.promise(() => import('./webcodecs-browser.ts'));
        return yield* compareOn(host, pageSound)(urls);
      }),
    ),
  ),
);

/** The page's media: its narration an `Audio` element, its compares on `<video>`. */
export const mediaLayer = Media.layerOver(pageAudio);
