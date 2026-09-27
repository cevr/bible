// Fixture for film/drawing-literal: each line marked RED fires the rule, and
// nothing else does.
declare const drawing: (d: object) => object;
declare const makeTimeline: () => Record<string, unknown>;
declare const shared: object;

const lifted = { go: { mark: 'go', dur: 0.4 } };
const typed = { go: { mark: 'go', dur: 0.4 } } as const satisfies object;
let loose = { go: { mark: 'go', dur: 0.4 } };
const knobs = { palm: [960, 800] };

export const computed = drawing({
  timeline: makeTimeline(), // RED film/drawing-literal
  draw: () => {},
});

export const spread = drawing({
  ...shared, // RED film/drawing-literal
  draw: () => {},
});

export const notConst = drawing({
  timeline: loose, // RED film/drawing-literal
  knobs: shared, // RED film/drawing-literal
  draw: () => {},
});

export const notLiteral = drawing(shared); // RED film/drawing-literal

export const inline = drawing({ timeline: { go: { mark: 'go', dur: 0.4 } }, draw: () => {} });
export const fromConst = drawing({ timeline: lifted, knobs, draw: () => {} });
export const throughAs = drawing({ timeline: typed, draw: () => {} });

export const bare = { timeline: lifted, draw: () => {} }; // RED film/drawing-literal
export const noTimeline = { draw: () => {} };

loose = lifted;
