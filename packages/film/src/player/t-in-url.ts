// The preview's time in the URL (`#t=`, `Places`, core/api.ts): the one
// place a reload reads T from, written only through this. While T moves
// (play, a drag) it is written at most once per period; when T settles (the
// end of a drag, a pause, the film's end) or jumps (a seek) it is written at
// once, each write naming its cause (`TimeCause`).
// When the lab asks for a write, which reloads the page, it is written at
// once and held there until T next settles, so the reload lands on the frame
// the write was made at. (`pagehide` cannot do this: a URL written during it
// does not reach the reload.) Back or Forward landing on an entry moves T to
// the time that entry keeps, and a write still waiting for the entry left is
// dropped, so the later frame is never written over the one landed on. What
// the URL holds beside the time (the play page's film, the lab's scene and
// selection) is the page's own writer's.

import { type Throttled, type Timers, throttled } from './throttle.ts';

/**
 * `T` as `#t=` keeps it: to the millisecond, rounded up, so a reload reads it
 * back in its own frame and never before it. A scene's start that falls
 * between two hundredths (`]` seeks there exactly) would read back in the
 * scene before. The nudge below 1e-6 keeps a time already on the grid as
 * itself, so reload after reload never creeps.
 */
export const onTheMs = (T: number): number => Math.ceil(T * 1000 - 1e-6) / 1000;

/**
 * Why T is written: it moved on its own or under a drag, or came to rest
 * there (`'play'`), or it was sent somewhere (`'jump'`: `]`, `[`, a frame
 * step, ⌘K to a scene, Go to, a press on the track). The page's writer says
 * what each enters in history: the lab makes a jump to another scene a step
 * Back walks, and rewrites the entry as play crosses one.
 */
export type TimeCause = 'play' | 'jump';

/**
 * Each cause as the page's address bar moves for it (`addressOn`,
 * browser/host.ts): a jump is the viewer's move, entered as the place
 * declares it; play is the URL following the page, in place.
 */
export const TIME_MOVE: Readonly<Record<TimeCause, 'go' | 'follow'>> = {
  play: 'follow',
  jump: 'go',
};

/** Where a preview's time is kept: the film seconds an entry names, and the writer of `T` there. */
export interface TimeInUrl {
  /** The film seconds the entry at `href` names: the page's start when it names none. */
  readonly at: (href: string) => number;
  /** Write `T` (film seconds) into the URL, moved there by `cause`. */
  readonly write: (T: number, cause: TimeCause) => void;
}

interface TInUrl {
  /** T moved: write it, at most once per period. Held, nothing. */
  moved(): void;
  /** T settled: write it now, and let T move the URL again. */
  settled(): void;
  /** T was sent somewhere: write it now as a jump, and let T move the URL again. */
  jumped(): void;
  /** A write is on its way, and the page will reload: write T now, and keep it there. */
  held(): void;
  /** Back or Forward landed, and T is the time its entry keeps: drop a waiting write of the T before. */
  landed(): void;
}

export const tInUrl = (
  write: (cause: TimeCause) => void,
  everyMs: number,
  timers: Timers,
): TInUrl => {
  const moving: Throttled = throttled(() => write('play'), everyMs, timers);
  let holding = false;
  const now = (cause: TimeCause) => {
    moving.ran();
    write(cause);
  };
  return {
    moved() {
      if (!holding) moving.request();
    },
    settled() {
      holding = false;
      now('play');
    },
    jumped() {
      holding = false;
      now('jump');
    },
    held() {
      holding = true;
      now('play');
    },
    landed() {
      holding = false;
      moving.ran();
    },
  };
};
