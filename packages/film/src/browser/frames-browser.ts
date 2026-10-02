// Frames as the browser paints them (`frames.ts`): every ask is a raw
// `requestAnimationFrame`, so what waits on a frame runs inside that frame's
// callback, and a play loop costs no Effect step per frame (D1: on the probe film, a
// fiber step per frame measured 4.5-6.7% more at p95 between frames).

import { Frames } from './frames.ts';

/** The page's animation frames. */
export const framesLayer = Frames.layerOver((run) => {
  const id = requestAnimationFrame(run);
  return () => cancelAnimationFrame(id);
});
