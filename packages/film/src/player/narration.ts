// The film's narration as the preview plays it: one audio (`Media.audio`, a
// `Playable`: live an `Audio` element) and what is known of it, as a state. A film with no master has `None`; a master
// that will not load (a film made before its mix, whose `full.wav` is not
// there yet) or that the element cannot play is `Missing`, found once, and
// the preview then plays on its own clock and never asks it to play again. A
// play asked while it loads is remembered and starts once it can, from where
// the preview's clock is then; a pause takes it back. A play the browser
// refuses until the viewer clicks is `Blocked`, and the next play (a click)
// tries again. A play a pause cut short is the audio doing as asked, not a
// failure (`Media.play` says which a refusal was). Framework-free: the render
// page loads this.

import { Context, Effect } from 'effect';
import { Media, Played } from '../browser/media.ts';

/** What the preview knows of its narration. */
type NarrationState =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Ready' }
  | { readonly _tag: 'Blocked' }
  | { readonly _tag: 'Missing'; readonly reason: string };

interface Narration {
  readonly state: () => NarrationState;
  /** Whether it can follow the clock now: loaded and not refused. */
  readonly ready: () => boolean;
  /** Where the narration is, while it plays: the clock to follow. */
  readonly playingAt: () => number | undefined;
  readonly seek: (t: number) => void;
  /**
   * Play from `at()`, the preview's clock: now when it can, or once it has
   * loaded when asked while it loads. A refusal becomes its state.
   */
  readonly play: (at: () => number) => void;
  readonly pause: () => void;
}

const NONE: NarrationState = { _tag: 'None' };

/**
 * The narration at `src` (none when the film has no master), played through
 * the audio `host`'s `Media` makes. `changed` hears each new state, so the
 * preview can say it.
 */
export const narration = (
  src: string | undefined,
  host: Context.Context<Media>,
  changed: (state: NarrationState) => void = () => {},
): Narration => {
  if (src === undefined)
    return {
      state: () => NONE,
      ready: () => false,
      playingAt: () => undefined,
      seek: () => {},
      play: () => {},
      pause: () => {},
    };
  const media = Context.get(host, Media);
  const audio = media.audio(src);
  /** The page lives as long as its narration: nothing the audio is asked to hear is taken back. */
  const always = new AbortController().signal;
  let state: NarrationState = { _tag: 'Loading' };
  const become = (next: NarrationState) => {
    state = next;
    changed(next);
  };
  const missing = () => become({ _tag: 'Missing', reason: `no narration at ${src}` });
  audio.on('error', missing, always);
  /** A play asked while loading: the clock to start from once it can. */
  let wanted: (() => number) | undefined;
  const start = (at: () => number) => {
    // The time set and the play asked in the same task: a click's leave to play sound holds.
    Effect.runForkWith(host)(audio.seek(at()));
    Effect.runForkWith(host)(Effect.map(media.play(audio), played));
  };
  audio.on(
    'canplay',
    () => {
      if (state._tag !== 'Loading') return;
      become({ _tag: 'Ready' });
      const at = wanted;
      wanted = undefined;
      if (at !== undefined) start(at);
    },
    always,
  );
  /** What a play came to, as the narration's state. */
  const played = (outcome: Played) =>
    Played.$match(outcome, {
      Playing: () => {},
      Muted: () => {},
      Aborted: () => {},
      Blocked: () => become({ _tag: 'Blocked' }),
      Failed: () => missing(),
    });
  const ready = () => state._tag === 'Ready';
  return {
    state: () => state,
    ready,
    playingAt: () => (ready() && audio.playing() ? audio.time() : undefined),
    seek: (t) => {
      Effect.runForkWith(host)(audio.seek(t));
    },
    play: (at) => {
      if (state._tag === 'Loading') wanted = at;
      if (state._tag !== 'Ready' && state._tag !== 'Blocked') return;
      if (state._tag === 'Blocked') become({ _tag: 'Ready' });
      start(at);
    },
    pause: () => {
      wanted = undefined;
      Effect.runSyncWith(host)(audio.pause);
    },
  };
};

/** What the preview says of its narration, when it cannot play it. */
export const narrationNote = (state: NarrationState): string => {
  if (state._tag === 'Missing') return ' · no narration';
  if (state._tag === 'Blocked') return ' · narration waits for a click';
  return '';
};
