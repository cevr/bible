// A film of one long scene, for the browser tests of the cue strip on a
// phone: its narration runs well past the strip's 8 s window there
// (`stripWindow`), with a cue on a word near its start and one on a word
// near its end, so a cue can lie outside the window the playhead holds. Kept
// apart from the probe film, whose frames are the film-frame proof.

import { type Film, createFilm, drawing } from '../../canvas/film.ts';

/** The long film's name in its registry and in the lab's URLs. */
export const LONG = 'long';

/** Its one scene's name. */
export const LONG_SCENE = 'wide';

const wide = drawing({
  timeline: {
    early: { mark: 'early', dur: 0.5 },
    late: { mark: 'late', dur: 0.5 },
  },
  draw: (f) => {
    f.ctx.fillStyle = '#6a5a48';
    f.ctx.fillRect(40 + 200 * f.at('early'), 40, 120, 80 + 80 * f.at('late'));
  },
});

/** The long film, laid out afresh: one scene, its marks a word in and a word from its end. */
export const longFilm = (): Film =>
  createFilm({
    title: 'Long',
    width: 640,
    height: 360,
    fps: 30,
    paper: { base: '#f4ecd8', tone: '#2a2520', seed: 1 },
    shade: '#000',
    scenes: [
      {
        id: LONG_SCENE,
        say: 'The {early}first thing moves, and then a long run of words carries the scene on and on, well past the eight seconds a phone shows of it, through one more clause and then another, until at the very end the {late}last thing moves too.',
        ...wide,
        drift: 0,
      },
    ],
  });
