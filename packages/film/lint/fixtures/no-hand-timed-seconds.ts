// Fixture for film/no-hand-timed-seconds: each line marked RED fires the rule,
// and nothing else does.
import { drawing } from '@bible/film/canvas';
import { clamp, envelope, keys, progress } from '@bible/film/core';

const RISE = [
  [0, 0],
  [1, 1],
] as const;

export const scene = drawing({
  timeline: {
    lead: { mark: 'go', offset: -0.3, dur: 0.4 },
    near: { mark: 'go', offset: 1, dur: 0.4 },
    far: { mark: 'go', offset: 1.4, dur: 0.4 }, // RED film/no-hand-timed-seconds
    early: { mark: 'go', offset: -1.2, dur: 0.4 }, // RED film/no-hand-timed-seconds
    word: { mark: 'go', word: 'then', offset: -0.2, dur: 0.4 },
    held: { scene: 'start', offset: 10, dur: 1.2 }, // RED film/no-hand-timed-seconds
    voice: { scene: 'speech', offset: 2.5, dur: 1 }, // RED film/no-hand-timed-seconds
    open: { scene: 'start', offset: 0.2, dur: 1 },
    after: { scene: 'speechEnd', offset: 7.9, dur: 1.2 },
    chained: { after: 'held', offset: 0.6, dur: 4.5 },
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
