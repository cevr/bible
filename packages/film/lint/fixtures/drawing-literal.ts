// Fixture for film/drawing-literal: each line marked RED fires the rule, and
// nothing else does. Greek before the scenes (δικαιόω, πίστις) pins that a
// report lands on its line when offsets pass non-ASCII text.
import * as Film from '@bible/film/canvas';
import { drawing, drawing as d } from '@bible/film/canvas';

declare const makeTimeline: () => Record<string, unknown>;
declare const shared: object;
export const greek =
  'δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις δικαιόω πίστις';

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

export const twice = drawing({
  timeline: lifted,
  timeline: typed, // RED film/drawing-literal
  draw: () => {},
});

export const inline = drawing({ timeline: { go: { mark: 'go', dur: 0.4 } }, draw: () => {} });
export const fromConst = drawing({ timeline: lifted, knobs, draw: () => {} });
export const throughAs = drawing({ timeline: typed, draw: () => {} });

export const aliased = d({
  timeline: makeTimeline(), // RED film/drawing-literal
  draw: () => {},
});
export const aliasedFine = d({ timeline: lifted, draw: () => {} });

const renamed_ = drawing({ timeline: lifted, draw: () => {} });
export { renamed_ as renamed };

const hidden = drawing({ timeline: lifted, draw: () => {} }); // RED film/drawing-literal

export const factory = () => drawing({ timeline: lifted, draw: () => {} }); // RED film/drawing-literal

export const shadow = () => {
  const lifted = makeTimeline();
  return drawing({ timeline: lifted, draw: () => {} }); // RED film/drawing-literal
};

export const namespaced = Film.drawing({ timeline: lifted, draw: () => {} }); // RED film/drawing-literal

export const bare = { timeline: lifted, draw: () => {} }; // RED film/drawing-literal
export const noTimeline = { draw: () => {} };

loose = lifted;
hidden;
