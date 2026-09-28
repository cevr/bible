// A small film for the lab's browser tests: three scenes, the first with two
// cues on its narration's marks and a point and a number knob, drawn so a
// handle can be read off the frame; the third a camera pushed in on a knob.

import { camera } from '../../canvas/camera.ts';
import { type Film, createFilm, drawing } from '../../canvas/film.ts';

/** The probe film's name in its registry and in the lab's URLs. */
export const PROBE = 'probe';

const ball = drawing({
  timeline: {
    rise: { mark: 'rise', dur: 0.6 },
    fall: { mark: 'fall', dur: 0.4 },
  },
  knobs: { spot: [320, 200], size: 24 },
  draw: (f) => {
    const [x, y] = f.knob('spot');
    f.ctx.fillStyle = '#2a2520';
    f.ctx.beginPath();
    f.ctx.arc(x, y - 80 * f.at('rise') + 80 * f.at('fall'), f.knob('size'), 0, Math.PI * 2);
    f.ctx.fill();
  },
});

const rest = drawing({
  timeline: {},
  draw: (f) => {
    f.ctx.fillStyle = '#6a5a48';
    f.ctx.fillRect(40, 40, 120, 80);
  },
});

/**
 * A shot pushed in 2× on `face`: `pole` is read before the camera and drawn
 * inside it, as a film reads a camera's knobs at the top of its draw. The
 * pole lands at (120, 280) on the frame, and `face` at its centre.
 */
const shot = drawing({
  timeline: {},
  knobs: { face: [400, 200], faceZoom: 2, pole: [300, 250] },
  draw: (f) => {
    const face = f.knob('face');
    const pole = f.knob('pole');
    camera(f.ctx, { x: face[0], y: face[1], zoom: f.knob('faceZoom') }, 640, 360, () => {
      f.ctx.fillStyle = '#2a2520';
      f.ctx.fillRect(pole[0] - 4, pole[1] - 40, 8, 40);
      f.ctx.beginPath();
      f.ctx.arc(face[0], face[1], 12, 0, Math.PI * 2);
      f.ctx.fill();
    });
  },
});

/** The probe film, laid out afresh. */
export const probeFilm = (): Film =>
  createFilm({
    title: 'Probe',
    width: 640,
    height: 360,
    fps: 30,
    paper: { base: '#f4ecd8', tone: '#2a2520', seed: 1 },
    shade: '#000',
    scenes: [
      {
        id: 'one',
        say: 'The ball {rise}rises slowly, and then it {fall}falls down again.',
        ...ball,
      },
      { id: 'two', say: 'A second scene, with nothing to move.', ...rest },
      { id: 'three', say: 'A third scene, pushed in close on a face.', ...shot },
    ],
  });
