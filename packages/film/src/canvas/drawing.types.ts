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
