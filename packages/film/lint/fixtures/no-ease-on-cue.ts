// Fixture for film/no-ease-on-cue: each line marked RED fires the rule, and
// nothing else does.
import { drawing } from '@bible/film/canvas';
import * as Core from '@bible/film/core';
import { clamp, ease, ease as curve, lerp } from '@bible/film/core';

export const scene = drawing({
  timeline: { plunge: { mark: 'dark', dur: 1.1, ease: 'inCubic' } },
  draw: (f) => {
    const plunge = f.at('plunge');
    const grow = clamp(f.t);
    // A parameter named `ease` is the page's own.
    const own = (ease: { readonly inCubic: (x: number) => number }) => ease.inCubic(plunge);
    return [
      lerp(1, 9, ease.inCubic(plunge)), // RED film/no-ease-on-cue
      ease.outBack(f.at('plunge')), // RED film/no-ease-on-cue
      curve.inCubic(plunge), // RED film/no-ease-on-cue
      Core.ease.inCubic(f.at('plunge')), // RED film/no-ease-on-cue
      ease.outCubic(grow),
      ease.inOutSine(clamp(plunge * 3)), // RED film/no-cue-remap
      plunge,
      own,
    ];
  },
});

// A drawing's `light` is handed the frame as its `draw` is.
export const lit = drawing({
  timeline: { weave: { mark: 'robe', dur: 1.2 } },
  light: (f) => [
    ease.inCubic(f.at('weave')), // RED film/no-ease-on-cue
    clamp(f.at('weave') * 4), // RED film/no-cue-remap
  ],
  draw: () => [],
});
