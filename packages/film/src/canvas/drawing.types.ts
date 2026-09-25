// Compile-time checks for `drawing()`, run by the package typecheck: every
// name a drawing's timeline or its `draw` reads must be one the timeline
// declares. Each `@ts-expect-error` fails the typecheck if the line compiles.

import { drawing } from './film.ts';

export const declared = drawing({
  timeline: {
    stamp: { mark: 'justified' },
    cord: { after: 'stamp', dur: 0.4 },
    thud: { with: 'cord', offset: 0.1 },
    fade: { scene: 'speechEnd' },
  },
  draw: (f) => {
    f.cue('stamp');
    f.at('cord');
    // @ts-expect-error: a cue's ease is data on its span, never passed by the draw.
    f.at('cord', (x: number) => x);
    // @ts-expect-error: `f.cue` names only declared cues.
    f.cue('stmap');
  },
});

export const afterTypo = drawing({
  timeline: {
    stamp: { mark: 'justified' },
    // @ts-expect-error: `after` names a cue of the same timeline.
    cord: { after: 'stmap', dur: 0.4 },
  },
  draw: () => {},
});

export const withTypo = drawing({
  timeline: {
    stamp: { mark: 'justified' },
    // @ts-expect-error: `with` names a cue of the same timeline.
    thud: { with: 'stmap' },
  },
  draw: () => {},
});

/** Reads a value as exactly `A`, so a widened or narrowed knob type fails the typecheck. */
const is =
  <A>() =>
  (_value: A) => {};

export const knobbed = drawing({
  timeline: {
    // An ease is one of the kit's names.
    slam: { mark: 'justified', ease: 'outBack' },
    // @ts-expect-error: `ease` names a curve in `ease`.
    thud: { mark: 'justified', ease: 'bouncy' },
  },
  knobs: { handY: 800, quoteAt: [960, 170] },
  draw: (f) => {
    is<number>()(f.knob('handY'));
    is<readonly [number, number]>()(f.knob('quoteAt'));
    // @ts-expect-error: `f.knob` names only declared knobs.
    f.knob('handX');
    // @ts-expect-error: a number knob is not a point.
    is<readonly [number, number]>()(f.knob('handY'));
  },
});

export const knobless = drawing({
  timeline: {},
  draw: (f) => {
    // @ts-expect-error: a drawing with no knobs has no `f.knob` names.
    f.knob('handY');
  },
});
