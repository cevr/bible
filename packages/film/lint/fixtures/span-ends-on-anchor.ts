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
    // A part that ends where its parent does, by numbers that add up.
    roll: { mark: 'lower', dur: 0.8 },
    steady: { with: 'roll', dur: 0.8 }, // RED film/span-ends-on-anchor
    speck: { mark: 'lower', dur: 1.17 },
    cheekOff: { with: 'speck', offset: 0.49, dur: 0.68 }, // RED film/span-ends-on-anchor
    tail: { with: 'land', offset: 0.1, dur: 0.3 }, // RED film/span-ends-on-anchor
    // Parts that end elsewhere, or say where they end.
    half: { with: 'roll', dur: 0.4 },
    past: { with: 'roll', offset: 0.2, dur: 0.8 },
    follows: { with: 'roll', until: { cue: 'roll' } },
    landsWith: { after: 'speck', dur: 0.68, ends: true },
    walk: { mark: 'lower', until: 'true' },
    beside: { with: 'walk', dur: 1 },
  },
  draw: () => {},
});
