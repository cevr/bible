// The film's narration as the preview plays it: one audio element and what
// is known of it, as a state. A film with no master has `None`; a master
// that will not load (a film made before its mix, whose `full.wav` is not
// there yet) or that the element cannot play is `Missing`, found once, and
// the preview then plays on its own clock and never asks it to play again. A
// play the browser refuses until the viewer clicks is `Blocked`, and the next
// play (a click) tries again. A play a pause cut short (`AbortError`) is the
// element doing as asked, not a failure. Framework-free: the render page
// loads this.

/** What the preview knows of its narration. */
export type NarrationState =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Ready' }
  | { readonly _tag: 'Blocked' }
  | { readonly _tag: 'Missing'; readonly reason: string };

/** The part of an audio element the narration drives. */
export interface NarrationAudio {
  currentTime: number;
  readonly paused: boolean;
  readonly play: () => Promise<void>;
  readonly pause: () => void;
  readonly addEventListener: (type: 'error' | 'canplay', listener: () => void) => void;
}

export interface Narration {
  readonly state: () => NarrationState;
  /** Whether it can follow the clock now: loaded and not refused. */
  readonly ready: () => boolean;
  /** Where the narration is, while it plays: the clock to follow. */
  readonly playingAt: () => number | undefined;
  readonly seek: (t: number) => void;
  /** Play from where it is, when it can; a refusal becomes its state. */
  readonly play: () => void;
  readonly pause: () => void;
}

const NONE: NarrationState = { _tag: 'None' };

/**
 * The narration at `src` (none when the film has no master), played through
 * the element `make` gives (an `Audio` in the page). `changed` hears each new
 * state, so the preview can say it.
 */
export const narration = (
  src: string | undefined,
  make: (src: string) => NarrationAudio = (s) => new Audio(s),
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
  const audio = make(src);
  let state: NarrationState = { _tag: 'Loading' };
  const become = (next: NarrationState) => {
    state = next;
    changed(next);
  };
  const missing = () => become({ _tag: 'Missing', reason: `no narration at ${src}` });
  audio.addEventListener('error', missing);
  audio.addEventListener('canplay', () => {
    if (state._tag === 'Loading') become({ _tag: 'Ready' });
  });
  /** What a refused play means: the rejection is classified here, once. */
  const refused = (e: unknown) => {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'AbortError') return;
    if (name === 'NotAllowedError') return become({ _tag: 'Blocked' });
    missing();
  };
  const ready = () => state._tag === 'Ready';
  return {
    state: () => state,
    ready,
    playingAt: () => (ready() && !audio.paused ? audio.currentTime : undefined),
    seek: (t) => {
      audio.currentTime = t;
    },
    play: () => {
      if (state._tag !== 'Ready' && state._tag !== 'Blocked') return;
      if (state._tag === 'Blocked') become({ _tag: 'Ready' });
      audio.play().then(undefined, refused);
    },
    pause: () => audio.pause(),
  };
};

/** What the preview says of its narration, when it cannot play it. */
export const narrationNote = (state: NarrationState): string => {
  if (state._tag === 'Missing') return ' · no narration';
  if (state._tag === 'Blocked') return ' · narration waits for a click';
  return '';
};
