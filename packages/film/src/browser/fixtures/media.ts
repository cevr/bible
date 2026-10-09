// A stand-in media element for the unit tests (bun has none), seen through
// the pages' own `playableOf` (`media.ts`), so a test drives the same `Playable` the
// pages do: it records what it was asked, plays at once or rejects each play
// with the error named `refuse` (a `NotAllowedError` only while it is not
// muted, as a browser refuses sound nobody asked for), and says `seeked` a
// turn after a seek, as an element does (unless it `holdsSeeks`). It counts
// the listeners on it (`listening`). `answered` is done once every play's
// answer is in.

import { Effect, Option } from 'effect';
import type { Context } from 'effect';
import { hostOf } from '../host.ts';
import { Media, type MediaElement, type Playable, playableOf } from '../media.ts';

/** `HAVE_ENOUGH_DATA`. */
const LOADED = 4;

class FakeElement extends EventTarget implements MediaElement {
  readonly asked: Array<string> = [];
  readonly plays: Array<Promise<void>> = [];
  refuse: Option.Option<string>;
  paused = true;
  seeking = false;
  ended = false;
  muted = false;
  playbackRate = 1;
  duration = Number.NaN;
  readyState = 0;
  #time = 0;

  constructor(refuse: Option.Option<string>) {
    super();
    this.refuse = refuse;
  }

  get currentTime() {
    return this.#time;
  }

  set currentTime(t: number) {
    this.#time = t;
    this.asked.push(`seek ${t}`);
    if (this.holdsSeeks) return;
    Effect.runFork(
      Effect.andThen(
        Effect.yieldNow,
        Effect.sync(() => this.fire('seeked')),
      ),
    );
  }

  /** Its seeks never finish: no `seeked` comes, so each seek stays pending. */
  holdsSeeks = false;
  readonly #listening = new Map<string, number>();

  /** How many listeners of `type` are on it now; one whose signal aborted is gone. */
  listening(type: string): number {
    return this.#listening.get(type) ?? 0;
  }

  /** The adapter listens to it only until a signal aborts. */
  override addEventListener(
    type: string,
    listener: EventListener,
    options: { readonly signal: AbortSignal },
  ) {
    super.addEventListener(type, listener, options);
    if (options.signal.aborted) return;
    this.#listening.set(type, this.listening(type) + 1);
    options.signal.addEventListener(
      'abort',
      () => this.#listening.set(type, this.listening(type) - 1),
      { once: true },
    );
  }

  play() {
    this.asked.push('play');
    // The browser refuses sound nobody asked for, not a muted play.
    const refused = Option.filter(this.refuse, (name) => name !== 'NotAllowedError' || !this.muted);
    if (Option.isNone(refused)) this.paused = false;
    const play = Option.match(refused, {
      // oxlint-disable-next-line effect/noNewPromise -- an element's play() answers a Promise; this is the element
      onNone: () => Promise.resolve(),
      // oxlint-disable-next-line effect/noNewPromise -- as above
      onSome: (name) => Promise.reject(new DOMException('refused', name)),
    });
    this.plays.push(play);
    return play;
  }

  pause() {
    this.asked.push('pause');
    this.paused = true;
  }

  /** It has loaded `seconds` of media and can play: `loadedmetadata` and `canplay`. */
  finishLoading(seconds: number) {
    this.duration = seconds;
    this.readyState = LOADED;
    this.fire('loadedmetadata');
    this.fire('canplay');
  }

  /** It was asked to load its media again. */
  load() {
    this.asked.push('load');
  }

  fire(type: string) {
    this.dispatchEvent(new Event(type));
  }
}

/** A stand-in element (refusing each play with the error named `refuse`, when given), and its `Playable`. */
export const fakeMedia = (refuse?: string) => {
  const el = new FakeElement(Option.fromUndefinedOr(refuse));
  const media: Playable = playableOf(el);
  // oxlint-disable-next-line effect/noNewPromise -- the plays' own Promises, settled
  const answered = Effect.promise(() => Promise.allSettled(el.plays));
  return { el, media, asked: el.asked, answered };
};

/** A host whose `Media` makes its audio with `audio`. */
export const mediaHost = (audio: (src: string) => Playable): Context.Context<Media> =>
  hostOf(Media.layerOver(audio));
