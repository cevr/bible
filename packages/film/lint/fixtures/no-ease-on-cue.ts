// Fixture for film/no-ease-on-cue: each line marked RED fires the rule, and
// nothing else does.
import { drawing } from '@bible/film/canvas';
import { clamp, ease, lerp } from '@bible/film/core';

export const scene = drawing({
  timeline: { plunge: { mark: 'dark', dur: 1.1, ease: 'inCubic' } },
  draw: (f) => {
    const plunge = f.at('plunge');
    const grow = clamp(f.t);
    return [
      lerp(1, 9, ease.inCubic(plunge)), // RED film/no-ease-on-cue
      ease.outBack(f.at('plunge')), // RED film/no-ease-on-cue
      ease.outCubic(grow),
      ease.inOutSine(clamp(plunge * 3)), // RED film/no-cue-remap
      plunge,
    ];
  },
});
