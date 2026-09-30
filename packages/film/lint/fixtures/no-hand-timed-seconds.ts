// Fixture for film/no-hand-timed-seconds: each line marked RED fires the rule,
// and nothing else does.
import { drawing } from '@bible/film/canvas';
import { clamp, envelope, keys, progress } from '@bible/film/core';

const RISE = [
  [0, 0],
  [1, 1],
] as const;
/** A second, and an offset, hidden in module consts. */
const HOLD = 0.5;
const LATE = 1.4;
/** A share of the frame, not a second: never compared with the clock. */
const SCALE = 3.8;

export const scene = drawing({
  timeline: {
    lead: { mark: 'go', offset: -0.3, dur: 0.4 },
    near: { mark: 'go', offset: 1, dur: 0.4 },
    far: { mark: 'go', offset: 1.4, dur: 0.4 }, // RED film/no-hand-timed-seconds
    early: { mark: 'go', offset: -1.2, dur: 0.4 }, // RED film/no-hand-timed-seconds
    word: { mark: 'go', word: 'then', offset: -0.2, dur: 0.4 },
    held: { at: 'start', offset: 10, dur: 1.2 }, // RED film/no-hand-timed-seconds
    voice: { at: 'speech', offset: 2.5, dur: 1 }, // RED film/no-hand-timed-seconds
    open: { at: 'start', offset: 0.2, dur: 1 },
    after: { at: 'speechEnd', offset: 7.9, dur: 1.2 },
    chained: { after: 'held', offset: 0.6, dur: 4.5 },
    farConst: { mark: 'go', offset: LATE, dur: 0.4 }, // RED film/no-hand-timed-seconds
  },
  draw: (f) => {
    const { t } = f;
    const drift = f.cue('far');
    return [
      clamp(f.t / 2), // RED film/no-hand-timed-seconds
      clamp((t - drift.start) / 0.5), // RED film/no-hand-timed-seconds
      clamp((t - drift.start) * 4), // RED film/no-hand-timed-seconds
      (t - f.cue('near').end) / 12, // RED film/no-hand-timed-seconds
      progress(t, 1.2, 0.5), // RED film/no-hand-timed-seconds
      progress(f.t, f.mark('go') - 0.1, 1.1), // RED film/no-hand-timed-seconds
      envelope(t, drift.start, 0.3, 0.3, drift.end), // RED film/no-hand-timed-seconds
      keys(f.t, RISE), // RED film/no-hand-timed-seconds
      t > f.cue('near').end + 0.5, // RED film/no-hand-timed-seconds
      f.mark('go') - 0.4, // RED film/no-hand-timed-seconds
      t - drift.start - 0.8 - 0.1, // RED film/no-hand-timed-seconds
      t > 3.5, // RED film/no-hand-timed-seconds
      12 <= f.t, // RED film/no-hand-timed-seconds
      t - drift.start > 0.5, // RED film/no-hand-timed-seconds
      (t - 3) / 2, // RED film/no-hand-timed-seconds
      clamp(t - 4.2), // RED film/no-hand-timed-seconds
      clamp((t - drift.start) / HOLD), // RED film/no-hand-timed-seconds
      f.T - 12.3, // RED film/no-hand-timed-seconds
      f.dur - 1.5, // RED film/no-hand-timed-seconds
      t > 0,
      t - drift.start >= 0,
      Math.sin(t * 2 + 1.3),
      f.dur * 0.6,
      drift.dur * SCALE,
      SCALE - 1,
      f.at('far'),
      f.keys('far', RISE),
      keys(t - drift.start, RISE),
      Math.sin(t * 7) * 5,
      Math.sin((t - drift.start) * 7) * 5,
      f.stagger('far', 2, 5),
      progress(t, drift.start, drift.dur),
      clamp((t - drift.start) / drift.dur),
      drift.start + drift.dur / 2,
      [1, 2].map((i) => i * 0.1),
    ];
  },
});
