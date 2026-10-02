// Frames a unit test runs by hand (`Frames.layerOver` on asks it keeps):
// `frame(at)` runs every callback asked for, at `at` ms; `pending` counts the
// asks waiting.

import { type Ask, Frames } from '../frames.ts';

export const manualFrames = () => {
  let asked: Array<(at: number) => void> = [];
  const ask: Ask = (run) => {
    asked.push(run);
    return () => {
      asked = asked.filter((r) => r !== run);
    };
  };
  return {
    layer: Frames.layerOver(ask),
    pending: () => asked.length,
    frame: (at: number) => {
      const due = asked;
      asked = [];
      for (const run of due) run(at);
    },
  };
};
