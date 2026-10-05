// The studio's media clock: one for every pane of a compare (`frame-pane.ts`),
// each pane reading its time from it, so two versions played together are
// never apart (the `<video>` pair is only pulled back once it drifts past the
// sync's 0.2 s); and the preview's (`player/main.ts`), which a film's frames
// follow off the narration. It stands while paused and runs at its rate from
// where it stood; a seek or a rate change starts it again from there. It
// reads `now` (seconds, monotonic: the host's `monotonicMs` live, `host.ts`;
// a number in a test),
// never the wall clock, which a sync or the owner may set on or back, nor
// the sound's own clock, which a browser holds suspended until a gesture.

export interface MediaClock {
  /** Where the compare is, in seconds. */
  readonly time: () => number;
  readonly playing: () => boolean;
  /** Run from where it stands; running already, nothing changes. */
  readonly play: () => void;
  /** Stand where it is. */
  readonly pause: () => void;
  /** Stand at, or run on from, `t`. */
  readonly seek: (t: number) => void;
  /** Run at `rate` from here. */
  readonly rate: (rate: number) => void;
}

/** A clock over `now`, standing at 0. */
export const makeClock = (now: () => number): MediaClock => {
  let from = 0;
  let since = now();
  let running = false;
  let speed = 1;
  const time = () => {
    if (!running) return from;
    return from + (now() - since) * speed;
  };
  /** Start counting again from where it is now. */
  const anchor = (t: number) => {
    from = t;
    since = now();
  };
  return {
    time,
    playing: () => running,
    play: () => {
      if (running) return;
      anchor(from);
      running = true;
    },
    pause: () => {
      if (!running) return;
      anchor(time());
      running = false;
    },
    seek: (t) => anchor(t),
    rate: (rate) => {
      anchor(time());
      speed = rate;
    },
  };
};
