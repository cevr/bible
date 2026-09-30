// Fixture for film/span-ends-on-anchor: each line marked RED fires the rule,
// and nothing else does.
import { drawing } from '@bible/film/canvas';

/** A landing's length, in a module const. */
const LAND = 0.4;

export const scene = drawing({
  timeline: {
    grasp: { mark: 'lower', offset: -0.5, dur: 0.5 }, // RED film/span-ends-on-anchor
    land: { mark: 'true', offset: -LAND, dur: LAND }, // RED film/span-ends-on-anchor
    after: { with: 'grasp', offset: -0.3, dur: 0.3, ease: 'outBack' }, // RED film/span-ends-on-anchor
    ends: { mark: 'lower', dur: 0.5, ends: true },
    lead: { mark: 'lower', offset: -0.3, dur: 0.4 },
    early: { mark: 'lower', offset: -0.5, dur: 0.5, ends: true },
    instant: { mark: 'lower', offset: 0, dur: 0 },
  },
  draw: () => {},
});
