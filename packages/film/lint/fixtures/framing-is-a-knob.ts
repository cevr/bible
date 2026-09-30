// Fixture for film/framing-is-a-knob: each line marked RED fires the rule, and
// nothing else does.
import { type Camera, drawing, knobCamera, pushOn, shotPath } from '@bible/film/canvas';
import { lerp } from '@bible/film/core';

/** The unmoved frame. */
const REST: Camera = { x: 960, y: 540, zoom: 1 };
/** A framing written out. */
const FACE: Camera = { x: 1060, y: 580, zoom: 1.18 }; // RED film/framing-is-a-knob
/** A framing derived from the scene's geometry. */
const HOUSE_X = -1100;
const WINDOW: Camera = { x: HOUSE_X - 20, y: 790, zoom: 2.8 };
/** A push's two zooms in a tuple. */
const JUDGED_ZOOM = [1.22, 1.3] as const;
/** Where a push ends, in a module const. */
const ARK_IN = 2.75;
/** A scratch camera, rewritten each frame. */
const AT: Camera = { x: 960, y: 540, zoom: 1 };

export const scene = drawing({
  timeline: { lean: { mark: 'dark', dur: 1 }, hold: { mark: 'dark', dur: 2 } },
  knobs: { face: [800, 610], faceZoom: 1.22, pushOn: 1.12 },
  draw: (f) => {
    const lean = f.at('lean');
    const [x, y] = f.knob('face');
    AT.zoom = lerp(f.knob('faceZoom'), ARK_IN, lean); // RED film/framing-is-a-knob
    AT.zoom = f.knob('faceZoom');
    return [
      { x: lerp(960, 1060, lean), y: 540, zoom: 1 }, // RED film/framing-is-a-knob
      { x, y, zoom: lerp(JUDGED_ZOOM[0], JUDGED_ZOOM[1], lean) }, // RED film/framing-is-a-knob
      { x, y, zoom: f.knob('faceZoom') * lerp(1, 1.12, f.at('hold')) }, // RED film/framing-is-a-knob
      { ...REST, y: REST.y - 60 * lean, zoom: lerp(REST.zoom ?? 1, 1, lean) }, // RED film/framing-is-a-knob
      {
        ...REST,
        y: REST.y - f.knob('pushOn') * lean,
        zoom: lerp(REST.zoom ?? 1, f.knob('faceZoom'), lean),
      },
      { ...REST, rot: 0.1 },
      shotPath(REST, [[lean, knobCamera(f.knob('face'), f.knob('faceZoom'))]]),
      pushOn(knobCamera(f.knob('face'), f.knob('faceZoom')), f.knob('pushOn'), f.at('hold')),
      FACE,
      WINDOW,
    ];
  },
});
