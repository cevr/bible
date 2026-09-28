// A small film for the lab's browser tests: two scenes, the first with two
// cues on its narration's marks and a point and a number knob, drawn so a
// handle can be read off the frame.

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
    ],
  });
