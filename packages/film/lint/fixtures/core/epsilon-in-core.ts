// Fixture for a module test inside film's core: each line marked RED fires
// the rule, and nothing else does. Core's own modules name the clock's module
// `./time.ts` and the canvas's `../canvas/film`, relative to themselves: a
// module is told by the path its specifier resolves to, not by its spelling.
import { drawing } from '../../../src/canvas/film';
import { CLOCK_EPSILON, ease } from './time.ts';

declare const x: number;
declare const fps: number;

export const frame = Math.ceil(x * fps - CLOCK_EPSILON); // RED film/one-clock-epsilon

export const scene = drawing({
  timeline: { plunge: { mark: 'dark', dur: 1.1 } },
  draw: (f) => [ease.inCubic(f.at('plunge'))], // RED film/no-ease-on-cue
});
