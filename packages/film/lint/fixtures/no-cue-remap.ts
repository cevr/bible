// Fixture for film/no-cue-remap: each line marked RED fires the rule, and
// nothing else does.
import { type Frame, drawing } from '@bible/film/canvas';
import * as Core from '@bible/film/core';
import { clamp, clamp as cap } from '@bible/film/core';

/** A share of a cue, in a module const. */
const SHARE = 0.6;

export const scene = drawing({
  timeline: {
    answer: { mark: 'dark', dur: 1.6, ease: 'linear' },
    answerIn: { with: 'answer', dur: 0.4, ease: 'linear' },
  },
  draw: (f) => {
    const answer = f.at('answer');
    const grow = clamp(f.t);
    const passed = (p: number) => clamp(p * 3);
    return [
      clamp(answer * 4), // RED film/no-cue-remap
      clamp(4 * f.at('answer')), // RED film/no-cue-remap
      clamp(answer / SHARE), // RED film/no-cue-remap
      clamp(3 * answer - 2), // RED film/no-cue-remap
      clamp((answer - 0.75) / 0.25), // RED film/no-cue-remap
      clamp((answer - 2) * 3), // RED film/no-cue-remap
      Math.min(1, answer * 4), // RED film/no-cue-remap
      Math.min((answer - 0.75) / 0.25, 1), // RED film/no-cue-remap
      clamp(f.at('answerIn')),
      Math.min(1, answer),
      Math.min(0.5, answer * 4),
      Math.min(1, grow * 2),
      clamp(answer),
      clamp(grow * 2),
      clamp(answer * grow),
      passed(answer),
      answer < 0.5, // RED film/no-cue-remap
      f.at('answer') >= 0.3, // RED film/no-cue-remap
      0.5 > answer, // RED film/no-cue-remap
      answer > SHARE, // RED film/no-cue-remap
      answer < 0.05, // RED film/no-cue-remap
      f.at('answerIn') > 0,
      answer >= 1,
      answer <= 0.01,
      answer > 0.99,
      grow < 0.5,
    ];
  },
});

// A parameter named like a module const is its own binding: its value is not known.
export const split = (f: Frame<'answer'>, SHARE: number) => [
  clamp(f.at('answer') / SHARE),
  f.at('answer') > SHARE,
];

// clamp is film's under an alias or off the module whole; the cue is the
// frame's however it is reached: a helper typed by the frame, `at` taken
// apart from it.
export const reached = (f: Frame<'answer'>) => {
  const { at } = f;
  return [
    cap(f.at('answer') * 4), // RED film/no-cue-remap
    Core.clamp(f.at('answer') * 4), // RED film/no-cue-remap
    clamp(at('answer') * 4), // RED film/no-cue-remap
    at('answer') > 0.5, // RED film/no-cue-remap
  ];
};

// An `.at` read off anything but the frame is no cue (Array.prototype.at);
// a parameter named `Math` or `clamp` is the page's own.
declare const widths: ReadonlyArray<number>;
export const notCues = (f: Frame<'answer'>, Math: { min: (a: number, b: number) => number }) => [
  clamp(widths.at(0) * 4),
  widths.at(-1) > 0.5,
  Math.min(1, f.at('answer') * 4),
];
export const ownClamp = (clamp: (x: number) => number, f: Frame<'answer'>) =>
  clamp(f.at('answer') * 4);
export const notAFrame = (g: { readonly at: (cue: string) => number }) => clamp(g.at('answer') * 4);
// A progress kept in a `let` may be written again before it is read: it is not traced.
export const kept = (f: Frame<'answer'>) => {
  let p = f.at('answer');
  p = 1 - p;
  return clamp(p * 4);
};
