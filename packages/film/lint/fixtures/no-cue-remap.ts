// Fixture for film/no-cue-remap: each line marked RED fires the rule, and
// nothing else does.
import { drawing } from '@bible/film/canvas';
import { clamp } from '@bible/film/core';

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
